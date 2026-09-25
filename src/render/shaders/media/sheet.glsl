// Shared behaviour of writing surfaces (paper, parchment, papyrus): outline, torn and
// burned edges, holes, stains, folds, smudges and the ink. The medium defines, before
// including this file:
//   void sheetFace(vec2 p, inout Surface s)  colour, roughness and relief of the sheet
//   float edgeWander(vec2 p)                 mm the outline wanders in or out
//   const float CORNER_RADIUS                mm
//   const float TEAR_SCALE                   mm, length of the wiggles in a torn edge
//   const float HOLE_RAGGED                  mm, how ragged the edges of holes are
// Palette: 0 sheet, 1 toned edges, 2 stain tint, 3 tidelines.

#include "../lib/shapes.glsl"
#include "../writing/ink.glsl"
#include "../damage/water.glsl"
#include "../damage/cuts.glsl"
#include "../damage/holes.glsl"
#include "../damage/burns.glsl"
#include "../damage/folds.glsl"
#include "../damage/smudges.glsl"
#include "../damage/blots.glsl"
#include "../damage/painted.glsl"

// Age spots: small rust-brown specks that gather in clusters.
float foxingAt(vec2 p) {
  if (u_foxing <= 0.0) return 0.0;
  vec3 cell = worley(p / 7.0 + u_damageSeed * 1.3);
  float present = step(cell.z, 0.15 + 0.5 * u_foxing);
  float size = 0.12 + 0.25 * cell.y;
  float spot = present * smoothstep(size, size * 0.3, cell.x);
  float cluster = smoothstep(0.3, 0.8, 0.5 + 0.5 * fbm(p / 40.0 + u_damageSeed, 3));
  return spot * mix(0.4, 1.0, cluster) * (0.6 + 0.4 * u_foxing);
}

// Darkening: broad brown patches where the sheet aged unevenly.
float darkeningAt(vec2 p, float inside) {
  if (u_darkening <= 0.0) return 0.0;
  float patches = smoothstep(0.35, 0.85, 0.5 + 0.5 * fbm(p / 45.0 + u_damageSeed * 2.1, 4));
  float edges = 1.0 - smoothstep(0.0, 25.0, inside);
  return clamp(u_darkening * (0.7 * patches + 0.5 * edges), 0.0, 1.0);
}

void buildSurface(vec2 p, inout Surface s) {
  float wander = edgeWander(p);
  if (u_shape == SHAPE_TORN) {
    wander += 1.6 * fbm(p / 9.0 + u_materialSeed * 5.0, 5) + 0.4 * snoise(p / 1.4 + u_materialSeed) * detail(0.5);
  }
  float outline = -outlineDistance(p, CORNER_RADIUS) + wander;
  float torn = -cutsAt(p, TEAR_ROW, u_tearCount, 1.8, TEAR_SCALE, 0.3);
  float holes = -holesAt(p, HOLE_RAGGED);
  float edges = min(outline, min(torn, holes)); // distance to the nearest edge, mm
  PaintedDamage painted = paintAt(p);
  // Painted holes, with fibrous edges.
  float hole = raggedEdge(painted.breakage, p, 2.5);
  // Painted burns: burned through in the middle, charred around that, scorched outside.
  Burning burn = burnsAt(p);
  float burnt = painted.burn + 0.2 * fbm(p / 4.0 + u_damageSeed * 3.1, 3);
  burn.missing = max(burn.missing, smoothstep(0.62, 0.7, burnt));
  burn.charred = max(burn.charred, smoothstep(0.42, 0.6, burnt));
  burn.scorch = max(burn.scorch, smoothstep(0.02, 0.45, painted.burn));
  s.alpha = coverageFrom(edges) * (1.0 - burn.missing) * (1.0 - hole);

  sheetFace(p, s);
  // Age toning: darker toward the edges of the original sheet.
  s.albedo *= mix(vec3(1.0), u_palette[1] / max(u_palette[0], vec3(0.01)), 0.6 * (1.0 - smoothstep(0.0, 14.0, outline)));
  // Torn edges and holes show pale, fluffy fibres.
  float tornEdge = 1.0 - smoothstep(0.0, 0.8, min(torn, holes));
  tornEdge = max(tornEdge, smoothstep(0.1, 0.45, painted.breakage) * (1.0 - hole));
  s.albedo = mix(s.albedo, min(s.albedo * 1.06 + 0.03, vec3(1.0)), 0.7 * tornEdge);

  float open = 1.0 - shielded(p);
  s.albedo = mix(s.albedo, s.albedo * vec3(0.72, 0.52, 0.34), 0.7 * foxingAt(p) * open);
  s.albedo = mix(s.albedo, s.albedo * vec3(0.7, 0.58, 0.44), darkeningAt(p, edges) * open);

  Water water = waterAt(p);
  // Painted water: soaked inside, with a dark tideline where it dried.
  if (painted.stain > 0.0) {
    float soaked = painted.stain + 0.15 * fbm(p / 6.0 + u_damageSeed * 1.3, 3);
    water.wet = max(water.wet, smoothstep(0.3, 0.6, soaked));
    float ring = (soaked - 0.45) / 0.07;
    water.tide = max(water.tide, 0.85 * exp(-ring * ring));
  }
  s.albedo *= mix(vec3(1.0), u_palette[2] / max(u_palette[0], vec3(0.01)), water.wet);
  s.albedo *= mix(vec3(1.0), u_palette[3] / max(u_palette[0], vec3(0.01)), water.tide);
  s.height += 0.3 * water.wet * fbm(p / 9.0 + u_damageSeed, 3);

  Folding folds = foldsAt(p);
  s.height += folds.height;
  s.albedo *= 1.0 - 0.12 * folds.crease - 0.04 * folds.wear;
  s.alpha *= 1.0 - smoothstep(0.75, 0.9, folds.hole);

  // The ink, worn off along the creases and dragged about where it was smudged.
  float ink = inkAmount(p, water.wet);
  Smudging smudge = smudgesAt(p);
  if (smudge.amount > 0.01) {
    float smeared = 0.0;
    for (int i = 1; i <= 6; i++) {
      float t = float(i) / 6.0;
      smeared = max(smeared, inkAmount(p + smudge.drag * t, water.wet) * (1.0 - 0.8 * t));
    }
    ink = mix(ink, max(ink * 0.6, smeared * 0.7), smudge.amount);
    s.albedo *= 1.0 - 0.08 * smudge.amount; // a greasy grey smear on the sheet itself
  }
  ink *= 1.0 - 0.8 * folds.wear;
  // Painted "rub out": the ink is worn off, leaving the faintest traces, and the sheet is scuffed.
  float rubbed = softEdge(painted.wear);
  ink *= 1.0 - 0.92 * rubbed;
  s.albedo = mix(s.albedo, min(s.albedo * 1.02 + 0.005, vec3(1.0)), 0.3 * rubbed);
  // A blot is one even pool of ink: nothing written underneath shows through it.
  ink = mix(ink, 0.96, max(blotsAt(p), paintedBlotAt(p, painted.blot)));
  // Dissolved ink spreads browner than it dried.
  vec3 tone = mix(inkColorAt(p), vec3(0.42, 0.33, 0.26), 0.6 * water.wet);
  s.albedo = mix(s.albedo, s.albedo * tone, ink);

  // Burns: scorched brown, then black and curling at the burned edge.
  s.albedo = mix(s.albedo, s.albedo * vec3(0.62, 0.45, 0.28), burn.scorch);
  s.albedo = mix(s.albedo, vec3(0.07, 0.055, 0.045), burn.charred);
  s.height += 0.2 * burn.charred * fbm(p / 1.5 + u_damageSeed, 3);
  s.roughness = mix(s.roughness, 0.5, burn.charred);
}
