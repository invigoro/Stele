// Shared behaviour of stone media: outline and arris, lettering, weathering and damage.
// The medium defines, before including this file:
//   void stoneFace(vec2 p, inout Surface s)  colour, roughness and fine relief of the face
//   vec3 freshStone(vec3 face)               colour of newly cut or broken stone
//   const float CORNER_RADIUS                mm
//   const float CHISEL_SLOPE                 V-cut depth per mm in from the letter edge
//   const float GRAIN_SIZE                   mm, scale of granular erosion
//   const float FLAKE_LAYER                  mm, thickness of the layer that flakes off

#include "../lib/shapes.glsl"
#include "../writing/carve.glsl"
#include "../writing/paint.glsl"
#include "../damage/chips.glsl"
#include "../damage/cuts.glsl"
#include "../damage/cracks.glsl"
#include "../damage/weathering.glsl"

const float ARRIS = 2.0; // mm, width of the rounded front edge

void buildSurface(vec2 p, inout Surface s) {
  // Outline, less any big breaks that make the slab a fragment.
  float outside = outlineDistance(p, CORNER_RADIUS);
  float broken = cutsAt(p, CUT_ROW, u_cutCount, 5.0, 28.0, 0.1);
  s.alpha = coverageFrom(min(-outside, -broken));
  float arris = clamp(1.0 + outside / ARRIS, 0.0, 1.0);
  s.height = -0.5 * ARRIS * (1.0 - sqrt(max(1.0 - arris * arris, 0.0))) + mouldingHeight(p, CORNER_RADIUS);
  // A broken edge falls away steeply and roughly.
  float breakFace = 1.0 - smoothstep(0.0, 4.0, -broken);
  s.height -= 4.0 * breakFace * breakFace * (0.8 + 0.4 * snoise(p / 1.5 + u_damageSeed));
  float face = s.height;

  stoneFace(p, s);
  s.albedo = mix(s.albedo, freshStone(s.albedo), 0.8 * breakFace);

  // Weathering: the face wears down unevenly and roughens.
  float patchy = 0.5 + 0.5 * fbm(p / 45.0 + u_fadeSeed, 3);
  float wear = u_fade * (0.35 + 0.9 * patchy);
  s.height += u_fade * 0.06 * GRAIN_SIZE * fbm(p / GRAIN_SIZE + u_fadeSeed * 3.0, 3) * detail(GRAIN_SIZE);
  s.roughness = mix(s.roughness, 0.85, u_fade);
  s.albedo *= 1.0 - 0.06 * u_fade * patchy;

  if (u_textSize > 0.0) {
    if (u_writing == WRITING_PAINT) {
      float paint = paintCoverage(p, wear);
      s.albedo = mix(s.albedo, paintColor(wear), paint);
      s.height += 0.02 * paint;
      s.roughness = mix(s.roughness, 0.55, paint);
    } else {
      float erosion = pow(wear, 1.3) * 0.09 * u_textSize;
      float rounding = 0.04 * u_textSize * (0.3 + u_fade);
      float cut = carveDepth(textDistance(p), CHISEL_SLOPE, erosion, rounding, 0.07 * u_textSize);
      s.height -= cut;
      float inCut = smoothstep(0.0, 0.3, cut);
      s.albedo = mix(s.albedo, freshStone(s.albedo), inCut * (1.0 - 0.8 * u_fade));
      if (u_fill > 0.5) {
        float fill = inCut * fillKept(p, cut, wear);
        s.albedo = mix(s.albedo, u_writingColor, fill);
        s.metal = max(s.metal, u_gilt * fill);
        s.roughness = mix(s.roughness, mix(0.6, 0.25, u_gilt), fill);
      }
    }
  }

  // Flaking takes a whole layer off, lettering and all.
  float flaked = flakesAt(p);
  if (flaked > 0.0) {
    s.height = min(s.height, face - FLAKE_LAYER * flaked * (0.9 + 0.2 * snoise(p / 2.0 + u_damageSeed)));
    s.albedo = mix(s.albedo, freshStone(s.albedo), 0.6 * flaked);
    s.roughness = mix(s.roughness, 0.9, flaked);
    s.metal *= 1.0 - flaked;
  }
  s.height -= pitsAt(p);

  Chipping chips = chipsAt(p);
  if (chips.depth > 0.0) s.height = min(s.height, face - chips.depth);
  s.albedo = mix(s.albedo, freshStone(s.albedo), 0.8 * chips.fresh);
  s.roughness = mix(s.roughness, 0.9, chips.fresh);
  s.metal *= 1.0 - chips.fresh;
  s.alpha *= 1.0 - chips.missing;

  float grime;
  s.height -= crackDepth(p, grime);
  s.albedo *= 1.0 - 0.55 * grime;

  s.albedo *= mix(vec3(1.0), vec3(0.42, 0.4, 0.37), sootAt(p));

  // Lichen grows over everything, partly filling the grooves.
  Growth lichen = lichenAt(p);
  if (lichen.cover > 0.0) {
    s.height = mix(s.height, max(s.height, face - 0.6) + lichen.height, lichen.cover);
    s.albedo = mix(s.albedo, lichen.color, lichen.cover);
    s.roughness = mix(s.roughness, 1.0, lichen.cover);
    s.metal *= 1.0 - lichen.cover;
  }
}
