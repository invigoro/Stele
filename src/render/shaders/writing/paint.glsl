// Paint on the surface, from the text distance field. As it weathers it turns chalky
// and flakes off in islands, showing the surface beneath.

// Paint coverage at p, 0..1.
float paintCoverage(vec2 p, float wear) {
  float px = 1.0 / u_pxPerMm;
  // Paint spreads a hair past the letter's edge.
  float cover = smoothstep(-0.7 * px, 0.7 * px, textDistance(p) + 0.015 * u_textSize);
  vec3 cell = worley(p / 1.8 + u_fadeSeed);
  float flaked = smoothstep(0.1, 0.35, wear * 1.3 - cell.y * 0.8 + 0.3 * snoise(p / 4.0 + u_fadeSeed));
  return cover * (1.0 - flaked);
}

vec3 paintColor(float wear) {
  return mix(u_writingColor, mix(u_writingColor, vec3(0.8, 0.78, 0.74), 0.35), clamp(wear, 0.0, 1.0));
}
