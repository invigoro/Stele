#version 300 es
// Bakes one period of tiling gradient noise into a texture for lib/noise.glsl to read.
precision highp float;

#include "lib/classicnoise2d.glsl"

uniform vec2 u_size;    // texture size in texels
uniform float u_period; // noise cells across the texture

out vec4 outNoise;

void main() {
  vec2 cell = gl_FragCoord.xy / u_size * u_period;
  outNoise = vec4(pnoise(cell, vec2(u_period)));
}
