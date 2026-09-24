// Paper: a cream sheet with soft mottling and faint fibres, written in iron-gall ink,
// with water stains that tint the sheet and make the ink run.

#include "../writing/ink.glsl"
#include "../damage/water.glsl"

const float CORNER_RADIUS = 0.8; // mm

vec3 paperColor(vec2 p) {
  vec2 q = p + u_materialSeed * 50.0;
  float mottle = fbm(q / 22.0, 4); // cloudy formation of the sheet
  float clumps = fbm(q / 1.6, 3);  // fibre clumps
  vec3 color = vec3(0.945, 0.915, 0.845) * (1.0 + 0.03 * mottle + 0.015 * clumps);
  // Fibres: faint short streaks in a few directions.
  float fibres = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.1 + u_materialSeed.x;
    vec2 f = mat2(cos(a), sin(a), -sin(a), cos(a)) * q;
    fibres += smoothstep(0.75, 1.0, 1.0 - abs(snoise(vec2(f.x * 0.25, f.y * 4.0))));
  }
  return color * (1.0 - 0.025 * fibres * detail(0.25));
}

void buildSurface(vec2 p, inout Surface s) {
  // Slightly irregular edges, as if trimmed by hand.
  float wobble = 0.25 * fbm(p / 6.0 + u_materialSeed * 7.0, 3);
  float inside = -sdRoundedBox(p - 0.5 * u_sizeMm, 0.5 * u_sizeMm, CORNER_RADIUS) + wobble;
  s.alpha = coverageFrom(inside);
  s.albedo = paperColor(p);
  // Age toning: darker toward the edges.
  s.albedo *= mix(vec3(1.0), vec3(0.93, 0.87, 0.76), 0.6 * (1.0 - smoothstep(0.0, 14.0, inside)));
  // Surface tooth and gentle cockling.
  s.height = 0.012 * fbm(p / 0.9 + u_materialSeed, 3) * detail(0.9) + 0.25 * fbm(p / 35.0 + u_materialSeed, 3);
  s.roughness = 0.9;

  Water water = waterAt(p);
  s.albedo *= mix(vec3(1.0), vec3(0.95, 0.90, 0.80), water.wet);
  s.albedo *= mix(vec3(1.0), vec3(0.78, 0.66, 0.50), water.tide);
  s.height += 0.3 * water.wet * fbm(p / 9.0 + u_damageSeed, 3);

  // Dissolved ink spreads browner than it dried on the page.
  vec3 ink = mix(inkColor(), vec3(0.42, 0.33, 0.26), 0.6 * water.wet);
  s.albedo = mix(s.albedo, s.albedo * ink, inkAmount(p, water.wet));
}
