// Entry point of the surface pass. The medium included before this file defines
// buildSurface().

layout(location = 0) out vec4 outSurface; // height (mm), alpha, roughness
layout(location = 1) out vec4 outAlbedo;  // sRGB colour

void main() {
  vec2 p = u_originMm + gl_FragCoord.xy / u_pxPerMm;
  Surface s = Surface(0.0, vec3(1.0), 0.5, 1.0);
  buildSurface(p, s);
  outSurface = vec4(s.height, s.alpha, s.roughness, 0.0);
  outAlbedo = vec4(clamp(s.albedo, 0.0, 1.0), 1.0);
}
