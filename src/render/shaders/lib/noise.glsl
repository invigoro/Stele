// Smooth gradient noise, read from a pre-baked tiling texture (see render/noise.ts)
// rather than computed. Direct3D's shader compiler inlines every call, and computed
// noise is ~60 instructions per call, which made the big surface shaders take over a
// second to compile; a texture read is two. Returns roughly [-1, 1].

uniform sampler2D u_noise;
uniform float u_noisePeriod; // noise cells across the texture, before it repeats

float snoise(vec2 p) {
  return textureLod(u_noise, p / u_noisePeriod, 0.0).r;
}
