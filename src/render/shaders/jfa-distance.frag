#version 300 es
// Jump flood, step 3 of 3: turn each pixel's nearest edge point into a signed
// distance in millimetres, positive inside letters.
precision highp float;

uniform sampler2D u_seeds;
uniform sampler2D u_mask;
uniform float u_mmPerPx;

out vec4 outDistance;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 seed = texelFetch(u_seeds, p, 0).xy;
  // With no letters at all there are no seeds; report "far outside".
  float d = min(distance(seed, vec2(p) + 0.5) * u_mmPerPx, 1000.0);
  bool inside = texelFetch(u_mask, p, 0).r >= 0.5;
  outDistance = vec4(inside ? d : -d);
}
