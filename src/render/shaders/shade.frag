#version 300 es
// Lighting: turns the surface maps into a picture of the object lit by one lamp plus
// soft ambient light. Distances are millimetres, with y pointing down the image.
precision highp float;

#include "lib/color.glsl"

uniform sampler2D u_surface; // height (mm), alpha, roughness, metal
uniform sampler2D u_albedo;  // sRGB colour
uniform float u_pxPerMm;
uniform vec3 u_lightDir;     // unit vector toward the lamp
uniform float u_ambient;
uniform float u_diffuse;
uniform float u_specular;
uniform float u_shininess;
uniform float u_shadowReach; // how far toward the lamp to look for occluders, mm
uniform vec4 u_background;   // straight-alpha colour behind the object

out vec4 outColor;

float heightAt(ivec2 p) {
  ivec2 size = textureSize(u_surface, 0);
  return texelFetch(u_surface, clamp(p, ivec2(0), size - 1), 0).r;
}

// Height at a position in pixels, interpolated.
float heightNear(vec2 px) {
  return texture(u_surface, px / vec2(textureSize(u_surface, 0))).r;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 center = vec2(p) + 0.5;
  vec4 surface = texelFetch(u_surface, p, 0);
  float h = surface.r;
  float alpha = surface.g;
  float roughness = surface.b;
  float metal = surface.a;
  vec3 albedo = srgbToLinear(texelFetch(u_albedo, p, 0).rgb);
  float mmPerPx = 1.0 / u_pxPerMm;

  // Surface normal from the height slope.
  float dx = (heightAt(p + ivec2(1, 0)) - heightAt(p - ivec2(1, 0))) / (2.0 * mmPerPx);
  float dy = (heightAt(p + ivec2(0, 1)) - heightAt(p - ivec2(0, 1))) / (2.0 * mmPerPx);
  vec3 n = normalize(vec3(-dx, -dy, 1.0));

  // Shadows: march toward the lamp; wherever the surface rises above the ray, this
  // point is in shadow. Near misses give a soft penumbra.
  float lit = 1.0;
  float across = length(u_lightDir.xy);
  if (across > 1.0e-3 && u_shadowReach > 0.0) {
    vec2 toward = u_lightDir.xy / across;
    float rise = u_lightDir.z / across; // mm up per mm across
    const int STEPS = 40;
    for (int i = 1; i <= STEPS; i++) {
      float t = u_shadowReach * float(i) / float(STEPS);
      float above = h + rise * t - heightNear(center + toward * t * u_pxPerMm);
      lit = min(lit, clamp(6.0 * above / t, 0.0, 1.0));
    }
  }

  // Ambient occlusion: recesses get less of the surrounding light.
  float occlusion = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 direction = vec2(cos(a), sin(a));
    occlusion += max(heightNear(center + direction * 0.4 * u_pxPerMm) - h, 0.0) / 0.4;
    occlusion += max(heightNear(center + direction * 1.2 * u_pxPerMm) - h, 0.0) / 1.2;
  }
  float ao = 1.0 - clamp(occlusion / 16.0 * 0.5, 0.0, 0.6);

  float diffuse = max(dot(n, u_lightDir), 0.0) * lit;
  vec3 halfway = normalize(u_lightDir + vec3(0.0, 0.0, 1.0));
  // Metal (gold leaf) reflects in its own colour, with tighter, stronger highlights.
  float shininess = mix(u_shininess, 90.0, metal);
  float strength = u_specular * (1.0 - roughness) + 1.4 * metal;
  vec3 glossColor = mix(vec3(1.0), albedo * 1.2, metal);
  vec3 gloss = glossColor * strength * pow(max(dot(n, halfway), 0.0), shininess) * lit;
  float sky = 0.6 + 0.4 * n.z; // ambient light mostly comes from in front
  vec3 color = albedo * (1.0 - 0.6 * metal) * (u_ambient * sky * ao + u_diffuse * diffuse) + gloss;
  // Gold mostly shows the surroundings it reflects; without them it looks like brown
  // paint. Fake a bright, soft environment, strongest on surfaces facing the viewer.
  color += albedo * metal * (0.55 + 0.35 * n.z) * ao;
  // Normalise so a flat, unshadowed patch shows exactly its albedo.
  color /= u_ambient + u_diffuse * u_lightDir.z;
  vec3 rgb = linearToSrgb(color);

  // Composite over the background, keeping straight (non-premultiplied) alpha.
  float a = alpha + u_background.a * (1.0 - alpha);
  vec3 blended = rgb * alpha + u_background.rgb * u_background.a * (1.0 - alpha);
  outColor = vec4(a > 0.0 ? blended / a : vec3(0.0), a);
}
