// Cellular (Worley) noise: one random feature point per unit cell. Each cell's random
// values are read from a fixed texture of random bytes (see render/noise.ts) rather than
// computed with sin-based hashes, which keeps shaders quick to compile.

uniform sampler2D u_random; // 256 × 256 texels of random bytes, one texel per cell

vec4 cellRandom(vec2 cell) {
  return texelFetch(u_random, ivec2(mod(cell, 256.0)), 0);
}

// Distance to the nearest feature point (x), and a random value pair for that
// point's cell (yz), so each cell can be given its own size or colour.
vec3 worley(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float best = 8.0;
  vec2 bestHash = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec4 r = cellRandom(cell + offset);
      vec2 d = offset + r.xy - f;
      float distance2 = dot(d, d);
      if (distance2 < best) {
        best = distance2;
        bestHash = r.zw;
      }
    }
  }
  return vec3(sqrt(best), bestHash);
}
