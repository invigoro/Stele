// Parchment: prepared animal skin. Warmer and more mottled than paper, with scattered
// follicle specks, a pronounced cockle, and a slightly irregular outline.
// Palette: 0 skin, 1 toned edges, 2 stain tint, 3 tidelines.

const float CORNER_RADIUS = 3.0;
const float TEAR_SCALE = 10.0;
const float HOLE_RAGGED = 0.5;

void sheetFace(vec2 p, inout Surface s) {
  vec2 q = p + u_materialSeed * 50.0;
  // Translucent and opaque patches from the skin's uneven thickness.
  float mottle = fbm(q / 30.0, 4);
  float blotch = fbm(q / 7.0 + 5.0, 3);
  vec3 color = u_palette[0] * (1.0 + 0.06 * mottle + 0.025 * blotch);
  color = mix(color, u_palette[1], 0.25 * smoothstep(0.2, 0.9, fbm(q / 55.0 + 9.0, 3)));
  // Follicle specks: tiny dark dots, in patches where the hair grew thicker.
  vec3 follicle = worley(q / 1.3);
  float speck = step(0.8, follicle.y) * smoothstep(0.18, 0.05, follicle.x);
  speck *= smoothstep(0.1, 0.6, 0.5 + 0.5 * fbm(q / 25.0, 2));
  color *= 1.0 - 0.25 * speck * detail(0.5);
  s.albedo = color;
  // Parchment cockles strongly as humidity changes.
  s.height = 0.6 * fbm(q / 28.0, 3) + 0.15 * fbm(q / 7.0, 3) + 0.01 * fbm(q / 0.8, 2) * detail(0.8);
  s.roughness = 0.7;
}

// The skin's outline is never a perfect rectangle.
float edgeWander(vec2 p) {
  return 1.2 * fbm(p / 40.0 + u_materialSeed * 3.0, 3) + 0.3 * fbm(p / 5.0 + u_materialSeed, 3);
}

#include "sheet.glsl"
