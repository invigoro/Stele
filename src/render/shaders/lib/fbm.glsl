// Fractal Brownian motion: layered octaves of gradient noise, each at twice the
// frequency and half the amplitude of the one before. Returns roughly [-1, 1].

#include "noise.glsl"

// Rotating each octave keeps the layers' grids from lining up into visible streaks.
const mat2 FBM_ROTATION = mat2(0.8, 0.6, -0.6, 0.8);

float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= octaves) break;
    sum += amplitude * snoise(p);
    total += amplitude;
    p = FBM_ROTATION * p * 2.0 + vec2(17.0, 31.0);
    amplitude *= 0.5;
  }
  return sum / total;
}
