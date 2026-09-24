// Sandstone: gritty, bedded stone.
// Palette: 0 ground, 1 dark grains, 2 light grains, 3 iron staining and bedding.

const float CORNER_RADIUS = 4.0;
const float CHISEL_SLOPE = 1.2;
const float GRAIN_SIZE = 1.2;
const float FLAKE_LAYER = 2.0;

void stoneFace(vec2 p, inout Surface s) {
  vec2 q = p + u_materialSeed * 20.0;
  // Bedding: faint bands across the stone, gently undulating.
  float bands = fbm(vec2(q.x / 90.0, q.y / 9.0 + 0.4 * fbm(q / 60.0, 2)), 3);
  vec3 color = mix(u_palette[0], u_palette[3], 0.3 * smoothstep(-0.2, 0.8, bands));
  // Iron staining in soft patches.
  color = mix(color, u_palette[3], 0.25 * smoothstep(0.2, 0.9, fbm(q / 50.0 + 3.0, 3)));
  // Grains: dark and light specks.
  float grains = snoise(q * 2.2) * detail(0.45);
  float specks = snoise(q * 4.5 + 9.0) * detail(0.22);
  color = mix(color, u_palette[1], 0.3 * smoothstep(0.35, 0.9, grains));
  color = mix(color, u_palette[2], 0.35 * smoothstep(0.5, 1.0, specks));
  s.albedo = color * (1.0 + 0.05 * fbm(q / 8.0, 3));
  // Gritty relief.
  s.height += 0.07 * fbm(q / 0.9, 3) * detail(0.9) + 0.2 * fbm(q / 12.0, 3);
  s.roughness = 0.92;
}

// Freshly cut sandstone is paler than its weathered skin.
vec3 freshStone(vec3 face) {
  return min(face * 1.1 + 0.02, vec3(1.0));
}

#include "stone.glsl"
