// Wood: a board with growth-ring grain and the odd knot. Lettering is carved (and
// perhaps gilded or painted in), painted on, or burned in; weathering turns it silver
// and wears the soft wood between the rings away, so the grain stands up.
// Palette: 0 earlywood, 1 latewood, 2 knots, 3 weathered grey.

#include "../lib/shapes.glsl"
#include "../writing/carve.glsl"
#include "../writing/paint.glsl"
#include "../writing/burn.glsl"
#include "../damage/chips.glsl"
#include "../damage/cuts.glsl"
#include "../damage/cracks.glsl"
#include "../damage/holes.glsl"
#include "../damage/burns.glsl"

const float CORNER_RADIUS = 3.0;
const float CHISEL_SLOPE = 1.4;

// Grain coordinates: x along the grain, y across it.
vec2 grainSpace(vec2 p) {
  float c = cos(u_grain);
  float s = sin(u_grain);
  return vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
}

// Colour of the bare wood, and `late` (0..1): how much of a dense latewood ring p is on.
vec3 woodColor(vec2 p, out float late) {
  vec2 g = grainSpace(p) + u_materialSeed * 30.0;
  // Knots: the grain bends around them.
  vec3 knotCell = worley(g / vec2(150.0, 55.0));
  float knot = step(knotCell.z, 0.45) * exp(-knotCell.x * knotCell.x / 0.012);
  // Rings: the board cuts through growth rings at a slight angle, so they show as long
  // wandering stripes that occasionally form arches.
  float rings = g.y / 2.2 + 3.0 * fbm(vec2(g.x / 120.0, g.y / 30.0), 3) + 0.4 * fbm(g / vec2(40.0, 6.0), 3);
  rings += 0.3 * fbm(g / vec2(200.0, 12.0), 3); // some years grew faster than others
  rings += 6.0 * knot;
  float ring = fract(rings);
  // Earlywood darkens gradually into latewood, which ends abruptly at the next ring.
  late = smoothstep(0.45, 0.85, ring) * (1.0 - smoothstep(0.93, 1.0, ring));
  vec3 color = mix(u_palette[0], u_palette[1], 0.75 * late);
  color = mix(color, u_palette[2], smoothstep(0.35, 0.8, knot));
  // Fine pores and fibres along the grain, and slow shifts of tone along the board.
  color *= 1.0 - 0.06 * smoothstep(0.3, 1.0, snoise(vec2(g.x / 3.0, g.y * 3.0))) * detail(0.33);
  color *= 1.0 - 0.04 * fbm(vec2(g.x / 8.0, g.y * 1.2), 3) * detail(0.8);
  return color * (1.0 + 0.06 * fbm(g / vec2(80.0, 20.0), 3));
}

void buildSurface(vec2 p, inout Surface s) {
  float outside = outlineDistance(p, CORNER_RADIUS);
  float broken = cutsAt(p, CUT_ROW, u_cutCount, 3.0, 12.0, 0.3);
  float inside = min(-outside, -broken);
  s.alpha = coverageFrom(inside);
  // Rounded-over edges.
  float edge = clamp(1.0 - inside / 3.0, 0.0, 1.0);
  s.height = -1.2 * edge * edge;
  float face = s.height;

  float late;
  vec3 color = woodColor(p, late);
  // Weathering: silvery grey, and the soft wood wears away between the rings.
  float patchy = 0.5 + 0.5 * fbm(p / 60.0 + u_fadeSeed, 3);
  float wear = u_fade * (0.4 + 0.8 * patchy);
  s.albedo = mix(color, u_palette[3] * (0.92 + 0.16 * late), 0.75 * smoothstep(0.1, 0.9, wear));
  s.height += 0.03 * late + 0.25 * wear * late;
  s.roughness = 0.75;

  if (u_textSize > 0.0) {
    if (u_writing == WRITING_PAINT) {
      float paint = paintCoverage(p, wear) * (1.0 - 0.3 * late * wear);
      s.albedo = mix(s.albedo, paintColor(wear), paint);
      s.height += 0.03 * paint;
      s.roughness = mix(s.roughness, 0.5, paint);
    } else if (u_writing == WRITING_BURN) {
      BurnedLetters burned = burnedLetters(p, wear);
      s.albedo = mix(s.albedo, s.albedo * vec3(0.55, 0.4, 0.3), burned.scorch);
      s.albedo = mix(s.albedo, u_writingColor, burned.charred);
      s.height -= burned.depth;
      s.roughness = mix(s.roughness, 0.6, burned.charred);
    } else {
      float erosion = pow(wear, 1.3) * 0.08 * u_textSize;
      float rounding = 0.05 * u_textSize * (0.3 + u_fade);
      float cut = carveDepth(textDistance(p), CHISEL_SLOPE, erosion, rounding, 0.06 * u_textSize);
      s.height -= cut;
      float inCut = smoothstep(0.0, 0.3, cut);
      // Freshly cut wood is much paler than the surface around it.
      s.albedo = mix(s.albedo, mix(min(color * 1.3 + 0.04, vec3(1.0)), s.albedo, 0.6 * u_fade), inCut);
      if (u_fill > 0.5) {
        float fill = inCut * fillKept(p, cut, wear);
        s.albedo = mix(s.albedo, u_writingColor, fill);
        s.metal = max(s.metal, u_gilt * fill);
        s.roughness = mix(s.roughness, mix(0.55, 0.25, u_gilt), fill);
      }
    }
  }

  // Rot: soft, dark, crumbling patches, worst toward the edges.
  if (u_rot > 0.0) {
    vec2 g = grainSpace(p);
    float n = 0.5 + 0.5 * fbm(vec2(g.x / 30.0, g.y / 10.0) + u_damageSeed, 4);
    float nearEdge = 1.0 - smoothstep(0.0, 40.0, inside);
    float rot = smoothstep(0.78, 0.9, n * (0.7 + 0.35 * u_rot) + nearEdge * 0.4 * u_rot) * (1.0 - shielded(p));
    s.albedo = mix(s.albedo, s.albedo * vec3(0.45, 0.37, 0.3), rot);
    s.height -= rot * (0.6 + 0.8 * fbm(p / 1.5 + u_damageSeed, 3));
    s.roughness = mix(s.roughness, 1.0, rot);
    s.metal *= 1.0 - rot;
  }

  // Gouges (chips stretched along the grain).
  Chipping gouges = chipsAt(p);
  if (gouges.depth > 0.0) s.height = min(s.height, face - gouges.depth);
  s.albedo = mix(s.albedo, min(color * 1.1, vec3(1.0)), gouges.fresh);
  s.metal *= 1.0 - gouges.fresh;
  s.alpha *= 1.0 - gouges.missing;

  // Splits along the grain.
  float grime;
  s.height -= crackDepth(p, grime);
  s.albedo *= 1.0 - 0.6 * grime;

  // Worm and nail holes: small dark pits, nail holes with a rusty ring.
  float hole = holesAt(p, 0.1);
  s.albedo *= 1.0 - 0.35 * smoothstep(-1.2, 0.0, hole);
  float pit = smoothstep(-0.1, 0.2, hole);
  s.albedo = mix(s.albedo, vec3(0.05, 0.04, 0.03), pit);
  s.height -= 3.0 * pit;

  // Burns: charred black and cracked in the middle, scorched brown around it.
  Burning burn = burnsAt(p);
  s.albedo = mix(s.albedo, s.albedo * vec3(0.5, 0.36, 0.24), burn.scorch);
  float charred = max(burn.charred, burn.missing);
  // Char breaks into blocks; points far from any cell centre lie along the cracks.
  float crackle = smoothstep(0.42, 0.55, worley(p / 2.0 + u_damageSeed).x) * detail(0.4);
  s.albedo = mix(s.albedo, vec3(0.07, 0.05, 0.04) * (1.0 + 0.6 * crackle), charred);
  s.height -= 1.5 * burn.missing + 0.4 * charred;
  s.roughness = mix(s.roughness, 0.45, charred);
  s.metal *= 1.0 - charred;
}
