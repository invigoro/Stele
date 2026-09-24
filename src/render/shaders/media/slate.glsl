// Slate: dark and fine-grained, with faint laminations and the odd rusty speck of
// pyrite. Freshly cut slate is pale grey, so new letters stand out clearly.
// Palette: 0 ground, 1 laminations, 2 rust, 3 fresh cut.

const float CORNER_RADIUS = 2.0;
const float CHISEL_SLOPE = 1.3;
const float GRAIN_SIZE = 0.6;
const float FLAKE_LAYER = 0.7;

void stoneFace(vec2 p, inout Surface s) {
  vec2 q = p + u_materialSeed * 20.0;
  float laminae = fbm(vec2(q.x / 60.0, q.y / 2.5), 4);
  vec3 color = mix(u_palette[0], u_palette[1], 0.5 + 0.5 * laminae);
  color *= 1.0 + 0.05 * fbm(q / 20.0, 3);
  vec3 cell = worley(q / 30.0);
  color = mix(color, u_palette[2], 0.6 * step(0.9, cell.y) * smoothstep(0.12, 0.0, cell.x));
  s.albedo = color;
  s.height += 0.02 * fbm(vec2(q.x / 20.0, q.y / 1.5), 3) * detail(1.5);
  s.roughness = 0.5;
}

vec3 freshStone(vec3 face) {
  return u_palette[3];
}

#include "stone.glsl"
