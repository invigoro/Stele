// Paper: a sheet with soft mottling and faint fibres.

const float CORNER_RADIUS = 0.8;
const float TEAR_SCALE = 8.0;
const float HOLE_RAGGED = 0.4;

void sheetFace(vec2 p, inout Surface s) {
  vec2 q = p + u_materialSeed * 50.0;
  float mottle = fbm(q / 22.0, 4); // cloudy formation of the sheet
  float clumps = fbm(q / 1.6, 3);  // fibre clumps
  vec3 color = u_palette[0] * (1.0 + 0.03 * mottle + 0.015 * clumps);
  // Fibres: faint short streaks in a few directions.
  float fibres = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.1 + u_materialSeed.x;
    vec2 f = mat2(cos(a), sin(a), -sin(a), cos(a)) * q;
    fibres += smoothstep(0.75, 1.0, 1.0 - abs(snoise(vec2(f.x * 0.25, f.y * 4.0))));
  }
  s.albedo = color * (1.0 - 0.025 * fibres * detail(0.25));
  // Surface tooth and gentle cockling.
  s.height = 0.012 * fbm(p / 0.9 + u_materialSeed, 3) * detail(0.9) + 0.25 * fbm(p / 35.0 + u_materialSeed, 3);
  s.roughness = 0.9;
}

// Slightly irregular edges, as if trimmed by hand.
float edgeWander(vec2 p) {
  return 0.25 * fbm(p / 6.0 + u_materialSeed * 7.0, 3);
}

#include "sheet.glsl"
