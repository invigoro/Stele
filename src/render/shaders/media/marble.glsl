// Marble: a polished slab with soft veins.
// Palette: 0 light ground, 1 darker ground, 2 halo around veins, 3 vein.

const float CORNER_RADIUS = 2.0;
const float CHISEL_SLOPE = 1.5;
const float GRAIN_SIZE = 0.7;
const float FLAKE_LAYER = 0.8;

void stoneFace(vec2 p, inout Surface s) {
  vec2 q = p / 60.0 + u_materialSeed;
  // Veins lie on the zero crossings of a wave running across the slab, bent by
  // turbulence into long, wandering sweeps. They fade in and out along their length.
  float angle = u_materialSeed.x * 0.37;
  vec2 across = vec2(cos(angle), sin(angle));
  float wave = sin(dot(q, across) * 3.0 + 3.5 * fbm(q * 1.2, 5));
  float strength = smoothstep(-0.3, 0.7, fbm(q * 0.9 + vec2(2.3, 8.1), 3));
  float ridge = 1.0 - abs(wave);
  float vein = strength * pow(ridge, 6.0);
  float halo = strength * pow(ridge, 1.5);
  // Fainter, finer veins crossing at another angle.
  float fine = 1.0 - abs(sin(dot(q, vec2(-across.y, across.x)) * 5.0 + 4.0 * fbm(q * 1.8 + 7.0, 5)));
  float hairline = pow(fine, 60.0) * smoothstep(-0.2, 0.6, fbm(q * 1.3 + 3.0, 2));

  float cloud = fbm(q * 0.5 + vec2(11.0, 4.0), 4);
  vec3 color = mix(u_palette[0], u_palette[1], 0.5 + 0.5 * cloud);
  color = mix(color, u_palette[2], 0.35 * halo);
  color = mix(color, u_palette[3], 0.5 * vein);
  color = mix(color, mix(u_palette[2], u_palette[3], 0.5), 0.25 * hairline);
  // Crystalline sparkle at a fraction of a millimetre.
  s.albedo = color * (1.0 + 0.03 * snoise(p * 3.0 + u_materialSeed * 17.0) * detail(0.33));
  s.roughness = 0.3;
}

// Freshly cut marble is a touch whiter.
vec3 freshStone(vec3 face) {
  return min(face * 1.03 + 0.02, vec3(1.0));
}

#include "stone.glsl"
