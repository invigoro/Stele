// Papyrus: strips of reed pith laid in two crossed layers and pressed together. The
// writing side shows horizontal strips, each streaked with fibres, with faint joins
// where they overlap; edges fray along the fibres.
// Palette: 0 light strip, 1 darker strip, 2 fibres, 3 joins.

const float CORNER_RADIUS = 1.0;
const float TEAR_SCALE = 14.0;
const float HOLE_RAGGED = 1.4;

// Coordinates along (x) and across (y) the fibres of the writing side.
vec2 fibreSpace(vec2 p) {
  float c = cos(u_grain);
  float s = sin(u_grain);
  return vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
}

void sheetFace(vec2 p, inout Surface s) {
  vec2 f = fibreSpace(p) + u_materialSeed * 40.0;
  // Straight strips 20–40 mm wide, each its own shade.
  float stripCoord = f.y / 28.0 + 0.04 * fbm(vec2(f.x / 90.0, f.y / 40.0), 2);
  float strip = floor(stripCoord);
  float within = fract(stripCoord);
  vec3 color = mix(u_palette[0], u_palette[1], hash1(strip + 3.7) * 0.8);
  // Long fibres running along each strip, coarse and fine.
  float fibres = fbm(vec2(f.x / 40.0, f.y * 1.4), 4);
  float fine = fbm(vec2(f.x / 12.0, f.y * 5.0), 3) * detail(0.2);
  color = mix(color, u_palette[2], 0.35 * smoothstep(0.1, 0.8, fibres) + 0.15 * smoothstep(0.2, 0.9, fine));
  // Darker joins where neighbouring strips overlap.
  float join = smoothstep(0.05, 0.0, within) + smoothstep(0.95, 1.0, within);
  color = mix(color, u_palette[3], 0.2 * join);
  // The cross layer on the back shows faintly through as vertical banding.
  float back = fbm(vec2(f.x * 1.2 / 28.0, f.y / 60.0) + 11.0, 3);
  color *= 1.0 + 0.03 * back;
  s.albedo = color;
  // Ridged fibre relief, strongest along the joins.
  s.height = 0.05 * fbm(vec2(f.x / 25.0, f.y * 2.0), 3) * detail(0.5) + 0.12 * join + 0.2 * fbm(p / 40.0, 2);
  s.roughness = 0.85;
}

// Frayed edges: fibres stick out further along the fibre direction.
float edgeWander(vec2 p) {
  vec2 f = fibreSpace(p) + u_materialSeed * 40.0;
  float coarse = fbm(vec2(f.x / 30.0, f.y / 12.0), 3);
  float fibrous = fbm(vec2(f.x / 6.0, f.y * 1.2), 3) * detail(0.4);
  return (0.6 + 3.0 * u_fraying) * coarse + (0.3 + 1.5 * u_fraying) * fibrous;
}

#include "sheet.glsl"
