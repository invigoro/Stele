#version 300 es
// Jump flood, step 1 of 3: mark pixels on a letter edge as seeds. Each seed stores
// the sub-pixel position of the edge, found by interpolating coverage toward
// whichever neighbour lies on the other side of the 0.5 threshold.
precision highp float;

uniform sampler2D u_mask; // red = letter coverage, 0..1

out vec4 outSeed; // xy = nearest known edge point in pixels, or NO_SEED

const vec2 NO_SEED = vec2(-1.0e6);
const ivec2 NEIGHBOURS[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));

float coverage(ivec2 p) {
  ivec2 size = textureSize(u_mask, 0);
  return texelFetch(u_mask, clamp(p, ivec2(0), size - 1), 0).r;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 center = vec2(p) + 0.5;
  float c = coverage(p);
  bool inside = c >= 0.5;

  vec2 best = NO_SEED;
  float bestDistance = 1.0e20;
  for (int i = 0; i < 4; i++) {
    float n = coverage(p + NEIGHBOURS[i]);
    if ((n >= 0.5) == inside) continue;
    // Where coverage crosses 0.5 on the way to this neighbour.
    float t = clamp((c - 0.5) / (c - n), 0.0, 1.0);
    vec2 edge = center + vec2(NEIGHBOURS[i]) * t;
    float d = distance(edge, center);
    if (d < bestDistance) {
      bestDistance = d;
      best = edge;
    }
  }
  outSeed = vec4(best, 0.0, 0.0);
}
