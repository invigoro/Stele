#version 300 es
// Jump flood, step 2 of 3, run once per step size with the step halving each time:
// adopt a neighbour's seed when it's closer than ours.
precision highp float;

uniform sampler2D u_seeds;
uniform int u_step;

out vec4 outSeed;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_seeds, 0);
  vec2 center = vec2(p) + 0.5;

  vec2 best = texelFetch(u_seeds, p, 0).xy;
  vec2 offset = best - center;
  float bestDistance = dot(offset, offset);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) continue;
      ivec2 q = p + ivec2(x, y) * u_step;
      if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, size))) continue;
      vec2 seed = texelFetch(u_seeds, q, 0).xy;
      offset = seed - center;
      float d = dot(offset, offset);
      if (d < bestDistance) {
        bestDistance = d;
        best = seed;
      }
    }
  }
  outSeed = vec4(best, 0.0, 0.0);
}
