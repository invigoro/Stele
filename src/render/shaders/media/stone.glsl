// Shared behaviour of stone media: outline and arris, lettering, weathering and damage.
// The medium defines, before including this file:
//   void stoneFace(vec2 p, inout Surface s)  colour, roughness and fine relief of the face
//   vec3 freshStone(vec3 face)               colour of newly cut or broken stone
//   const float CORNER_RADIUS                mm
//   const float CHISEL_SLOPE                 V-cut depth per mm in from the letter edge
//   const float GRAIN_SIZE                   mm, scale of granular erosion
//   const float FLAKE_LAYER                  mm, thickness of the layer that flakes off
// and may define:
//   #define ARRIS <mm>          width of the rounded front edge (2 mm if not)
//   #define FACE_SHAPE          and float faceShape(vec2 p), mm the face rises (a dome)
//   #define OUTLINE_WANDER      and float outlineWander(vec2 p), mm the outline strays outward
//   #define IMPRESSED_WRITING   to handle lettering pressed in with a stylus

#include "../lib/shapes.glsl"
#include "../writing/carve.glsl"
#include "../writing/paint.glsl"
#include "../damage/chips.glsl"
#include "../damage/cuts.glsl"
#include "../damage/cracks.glsl"
#include "../damage/weathering.glsl"
#include "../damage/painted.glsl"

#ifndef ARRIS
#define ARRIS 2.0
#endif

// Covers the surface with lichen or moss, which fills hollows up to `fill` mm below the face.
void overgrow(inout Surface s, Growth growth, float face, float fill) {
  if (growth.cover <= 0.0) return;
  s.height = mix(s.height, max(s.height, face - fill) + growth.height, growth.cover);
  s.albedo = mix(s.albedo, growth.color, growth.cover);
  s.roughness = mix(s.roughness, 1.0, growth.cover);
  s.metal *= 1.0 - growth.cover;
}

void buildSurface(vec2 p, inout Surface s) {
  // Outline, less any big breaks that make the slab a fragment.
  float outside = outlineDistance(p, CORNER_RADIUS);
#ifdef OUTLINE_WANDER
  outside -= outlineWander(p);
#endif
  float broken = cutsAt(p, CUT_ROW, u_cutCount, 5.0, 28.0, 0.1);
  s.alpha = coverageFrom(min(-outside, -broken));
  float arris = clamp(1.0 + outside / ARRIS, 0.0, 1.0);
  s.height = -0.5 * ARRIS * (1.0 - sqrt(max(1.0 - arris * arris, 0.0))) + mouldingHeight(p, CORNER_RADIUS);
#ifdef FACE_SHAPE
  s.height += faceShape(p);
#endif
  // A broken edge falls away steeply and roughly.
  float breakFace = 1.0 - smoothstep(0.0, 4.0, -broken);
  s.height -= 4.0 * breakFace * breakFace * (0.8 + 0.4 * snoise(p / 1.5 + u_damageSeed));
  float face = s.height;

  stoneFace(p, s);
  s.albedo = mix(s.albedo, freshStone(s.albedo), 0.8 * breakFace);
  // The face before any lettering: where damage takes the surface away, the letters' colour goes with it.
  vec3 faceColor = s.albedo;
  PaintedDamage painted = paintAt(p);
  float worn = softEdge(painted.wear); // painted "wear away"

  // Weathering: the face wears down unevenly and roughens.
  float patchy = 0.5 + 0.5 * fbm(p / 45.0 + u_fadeSeed, 3);
  float wear = u_fade * (0.35 + 0.9 * patchy);
  s.height += u_fade * 0.06 * GRAIN_SIZE * fbm(p / GRAIN_SIZE + u_fadeSeed * 3.0, 3) * detail(GRAIN_SIZE);
  s.roughness = mix(s.roughness, 0.85, u_fade);
  s.albedo *= 1.0 - 0.06 * u_fade * patchy;
  s.height += worn * 0.06 * fbm(p / 1.2 + u_damageSeed, 3);
  s.roughness = mix(s.roughness, 0.9, worn);

  if (u_textSize > 0.0) {
    if (u_writing == WRITING_PAINT) {
      float paint = paintCoverage(p, wear + 1.5 * worn);
      s.albedo = mix(s.albedo, paintColor(wear), paint);
      s.height += 0.02 * paint;
      s.roughness = mix(s.roughness, 0.55, paint);
    }
#ifdef IMPRESSED_WRITING
    else if (u_writing == WRITING_IMPRESS) {
      // Pressed into soft clay: a rounded groove, a little uneven, with the clay it
      // pushed aside standing up in a low lip along each side. Wear takes the lips
      // first, then the shallow parts of the grooves; dirt settles in them.
      float d = textDistance(p) + 0.04 * u_textSize * snoise(p / (0.5 * u_textSize) + u_materialSeed * 5.0);
      float erosion = pow(wear, 1.2) * 0.06 * u_textSize + worn * 0.1 * u_textSize;
      float groove = max(0.12 * u_textSize * smoothstep(-0.01 * u_textSize, 0.05 * u_textSize, d) - erosion, 0.0);
      float ridge = (d + 0.03 * u_textSize) / (0.02 * u_textSize);
      float lip = 0.012 * u_textSize * exp(-ridge * ridge) * (1.0 - 0.8 * wear) * (1.0 - worn);
      s.height += lip - groove;
      s.albedo *= 1.0 - 0.12 * smoothstep(0.0, 0.3, groove) * (0.4 + u_fade);
    }
#endif
    else {
      float erosion = pow(wear, 1.3) * 0.09 * u_textSize + worn * 0.12 * u_textSize;
      float rounding = 0.04 * u_textSize * (0.3 + u_fade);
      float cut = carveDepth(textDistance(p), CHISEL_SLOPE, erosion, rounding, 0.07 * u_textSize);
      s.height -= cut;
      float inCut = smoothstep(0.0, 0.3, cut);
      s.albedo = mix(s.albedo, freshStone(s.albedo), inCut * (1.0 - 0.8 * u_fade) * (1.0 - worn));
      if (u_fill > 0.5) {
        float fill = inCut * fillKept(p, cut, wear + worn);
        s.albedo = mix(s.albedo, u_writingColor, fill);
        s.metal = max(s.metal, u_gilt * fill);
        s.roughness = mix(s.roughness, mix(0.6, 0.25, u_gilt), fill);
      }
    }
  }

  // Spread-out damage stays off protected words.
  float open = 1.0 - shielded(p);

  // Flaking takes a whole layer off, lettering and all.
  float flaked = flakesAt(p) * open;
  if (flaked > 0.0) {
    s.height = min(s.height, face - FLAKE_LAYER * flaked * (0.9 + 0.2 * snoise(p / 2.0 + u_damageSeed)));
    s.albedo = mix(s.albedo, freshStone(faceColor), flaked);
    s.roughness = mix(s.roughness, 0.9, flaked);
    s.metal *= 1.0 - flaked;
  }
  s.height -= pitsAt(p) * open;

  Chipping chips = chipsAt(p);
  if (chips.depth > 0.0) s.height = min(s.height, face - chips.depth);
  s.albedo = mix(s.albedo, freshStone(faceColor), chips.fresh);
  s.roughness = mix(s.roughness, 0.9, chips.fresh);
  s.metal *= 1.0 - chips.fresh;
  s.alpha *= 1.0 - chips.missing;

  // Painted chips: a scar with a steep, ragged wall and a rough floor.
  float chipped = raggedEdge(painted.breakage, p, 4.0);
  if (chipped > 0.0) {
    float floorDepth = 2.2 + 0.8 * fbm(p / 2.5 + u_damageSeed * 1.9, 3);
    s.height = mix(s.height, min(s.height, face - floorDepth), chipped);
    s.albedo = mix(s.albedo, freshStone(faceColor), chipped);
    s.roughness = mix(s.roughness, 0.9, chipped);
    s.metal *= 1.0 - chipped;
  }

  float grime;
  s.height -= crackDepth(p, grime);
  s.albedo *= 1.0 - 0.55 * grime;

  s.albedo *= mix(vec3(1.0), vec3(0.42, 0.4, 0.37), sootAt(p) * open);

  // Painted stains soak in unevenly, and scorching leaves blotchy soot that thins out
  // toward its edges, over a faint warm discolouring.
  float stained = softEdge(painted.stain) * (0.5 + 0.5 * fbm(p / 5.0 + u_damageSeed * 2.3, 4));
  s.albedo *= mix(vec3(1.0), vec3(0.47, 0.42, 0.35), 0.8 * stained);
  float soot = softEdge(painted.burn) * (0.55 + 0.45 * fbm(p / 4.0 + u_damageSeed * 3.1, 4));
  s.albedo = mix(s.albedo, s.albedo * vec3(0.82, 0.74, 0.66), 0.5 * smoothstep(0.0, 0.3, painted.burn) * (1.0 - soot));
  s.albedo = mix(s.albedo, s.albedo * 0.16 + vec3(0.02), 0.9 * soot);
  s.roughness = mix(s.roughness, 0.95, soot);
  s.metal *= 1.0 - soot;

  // Lichen grows over everything, partly filling the grooves; painted moss grows thick
  // enough to fill them.
  Growth lichen = lichenAt(p);
  lichen.cover *= open;
  overgrow(s, lichen, face, 0.6);
  overgrow(s, mossAt(p, painted.growth), face, 0.15);
}
