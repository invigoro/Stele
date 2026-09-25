// Clay: a tablet shaped by hand into a pillow, with grit in the clay, a few pores and
// the maker's fingerprints, and darker clouds where the fire caught it. Lettering is
// pressed in with a stylus while the clay is soft.
// Palette: 0 clay, 1 darker clay, 2 fire clouds, 3 grit.

const float CORNER_RADIUS = 14.0;
const float CHISEL_SLOPE = 1.2;
const float GRAIN_SIZE = 0.5;
const float FLAKE_LAYER = 1.0;
#define ARRIS 10.0
#define FACE_SHAPE
#define OUTLINE_WANDER
#define IMPRESSED_WRITING

// Shaped by hand, the outline strays a little from a neat rectangle. mm.
float outlineWander(vec2 p) {
  return 1.5 * fbm(p / 30.0 + u_materialSeed * 3.0, 3);
}

// The face swells gently toward the middle, like a pillow. mm.
float faceShape(vec2 p) {
  vec2 q = (p - 0.5 * u_sizeMm) / (0.5 * u_sizeMm);
  return 2.0 * (1.0 - q.x * q.x) * (1.0 - q.y * q.y);
}

// Faint fingerprints near the top and bottom edges, where the maker held the tablet:
// ridges looping round a centre, fading out toward the edge of each print. mm.
float fingerprints(vec2 p) {
  float height = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 centre = u_sizeMm * vec2(0.2 + 0.6 * fract(u_materialSeed.x * 0.37 + fi * 0.53), mix(0.9, 0.1, fi));
    float angle = u_materialSeed.y + fi * 1.9;
    vec2 local = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * (p - centre);
    float r = length(local / vec2(6.0, 8.0));
    if (r > 1.0) continue;
    float ridge = sin((length(local * vec2(1.0, 0.8)) + 1.2 * fbm(local / 4.0 + fi * 3.0, 2)) * 13.96); // 0.45 mm apart
    height += 0.008 * ridge * (1.0 - smoothstep(0.6, 1.0, r)) * detail(0.45);
  }
  return height;
}

void stoneFace(vec2 p, inout Surface s) {
  vec2 q = p + u_materialSeed * 40.0;
  float mottle = 1.4 * fbm(q / 25.0, 3);
  float cloud = smoothstep(0.2, 0.7, fbm(q / 40.0 + 7.0, 3));
  vec3 color = mix(u_palette[0], u_palette[1], 0.5 + 0.5 * mottle);
  color = mix(color, u_palette[2], 0.45 * cloud);
  // Grit in the clay: pale and dark specks.
  vec3 grit = worley(q / 0.9);
  float speck = step(grit.z, 0.07) * smoothstep(0.22, 0.12, grit.x) * detail(0.3);
  color = mix(color, grit.y > 0.5 ? u_palette[3] : u_palette[2] * 0.8, 0.5 * speck);
  s.albedo = color * (1.0 + 0.04 * snoise(q / 0.4) * detail(0.4));
  // Smoothed by hand: shallow undulations, a few pores, and fingerprints.
  s.height += 0.25 * fbm(q / 18.0, 3) + 0.06 * fbm(q / 1.5, 2) * detail(1.5);
  vec3 pore = worley(q / 4.0 + 11.0);
  s.height -= 0.15 * step(pore.z, 0.05) * smoothstep(0.18, 0.05, pore.x);
  s.height += fingerprints(p);
  s.roughness = 0.9;
}

// Freshly broken clay is a little paler.
vec3 freshStone(vec3 face) {
  return min(face * 1.1 + 0.03, vec3(1.0));
}

#include "stone.glsl"
