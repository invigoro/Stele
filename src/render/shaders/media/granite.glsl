// Granite: interlocking crystals, polished. Cutting frosts the crystals, so carved
// letters show up pale even on black granite.
// Palette: 0 quartz, 1 feldspar, 2 pale mineral, 3 dark mica.

const float CORNER_RADIUS = 3.0;
const float CHISEL_SLOPE = 1.4;
const float GRAIN_SIZE = 1.0;
const float FLAKE_LAYER = 1.0;

void stoneFace(vec2 p, inout Surface s) {
  vec2 q = p + u_materialSeed * 20.0;
  // Mostly feldspar and quartz, with a little pale mineral and dark mica.
  vec3 crystal = worley(q / 1.7);
  float pick = crystal.y;
  vec3 color = pick < 0.5 ? u_palette[1] : pick < 0.86 ? u_palette[0] : pick < 0.94 ? u_palette[2] : u_palette[3];
  // Small dark flakes scattered through.
  vec3 flake = worley(q / 0.7 + 5.0);
  color = mix(color, u_palette[3], step(0.93, flake.y) * smoothstep(0.45, 0.3, flake.x) * detail(0.7));
  // No two crystals are quite the same shade.
  color *= 0.92 + 0.16 * crystal.z;
  // Crystals too small to see blend into their average colour rather than aliasing.
  vec3 average = 0.48 * u_palette[1] + 0.35 * u_palette[0] + 0.08 * u_palette[2] + 0.09 * u_palette[3];
  s.albedo = mix(average, color, detail(1.7));
  s.roughness = 0.15;
}

vec3 freshStone(vec3 face) {
  return mix(face, vec3(0.86, 0.86, 0.85), 0.72);
}

#include "stone.glsl"
