#version 300 es
// Phase 0 renderer check: a seeded, procedural marble-like pattern. It exercises the
// include system, the noise library and seeded uniforms. The real material pipeline
// replaces it in Phase 1.
precision highp float;

#include "lib/noise2d.glsl"
#include "lib/fbm.glsl"

uniform vec2 u_resolution; // drawing-buffer size in pixels
uniform vec2 u_offset;     // seed-derived offset into noise space

out vec4 outColor;

void main() {
  // About two and a half pattern units across the shorter side, whatever the canvas size.
  vec2 p = gl_FragCoord.xy / min(u_resolution.x, u_resolution.y) * 2.5 + u_offset;

  // Domain warping: offsetting the lookup point by noise bends smooth shapes into
  // marble-like swirls. One level is enough; nesting more breaks veins into speckle.
  vec2 warp = vec2(fbm(p, 4), fbm(p + vec2(5.2, 1.3), 4));
  vec2 q = p + 0.9 * warp;

  // Veins follow the zero crossings of low-frequency noise. Stretching that noise along
  // a diagonal turns closed loops into long sweeps, and a second noise fades each vein
  // in and out along its length.
  vec2 d = mat2(0.8, -0.6, 0.6, 0.8) * q;
  float major = snoise(vec2(d.x * 0.3, d.y * 1.2));
  float minor = snoise(vec2(d.x * 0.9, d.y * 2.6) + vec2(7.1, 3.4));
  float strength = smoothstep(-0.4, 0.6, fbm(q * 0.8 + vec2(2.3, 8.1), 3));
  float vein = strength * (1.0 - smoothstep(0.0, 0.05, abs(major)));
  float halo = strength * exp(-abs(major) * 10.0);
  float hairline = (1.0 - strength * 0.5) * (1.0 - smoothstep(0.0, 0.02, abs(minor)));

  float cloud = fbm(p * 0.6 + vec2(11.0, 4.0), 3);
  vec3 stone = mix(vec3(0.95, 0.94, 0.91), vec3(0.88, 0.87, 0.85), 0.5 + 0.5 * cloud);
  vec3 color = mix(stone, vec3(0.70, 0.70, 0.72), 0.35 * halo);
  color = mix(color, vec3(0.48, 0.49, 0.53), 0.7 * vein);
  color = mix(color, vec3(0.62, 0.62, 0.65), 0.4 * hairline);
  color *= 0.99 + 0.01 * snoise(p * 80.0); // fine crystalline grain

  outColor = vec4(color, 1.0);
}
