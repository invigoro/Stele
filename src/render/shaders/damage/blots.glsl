// Ink blots dropped over words marked [[like this]], read from the features texture
// (BLOT_ROW: x, y, rx, ry; +1: seed): a lobed blob with droplets spattered around it.

// Ink coverage from blots at p, 0..1.
float blotsAt(vec2 p) {
  float ink = 0.0;
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_blotCount) break;
    vec4 blot = texelFetch(u_features, ivec2(i, BLOT_ROW), 0);
    float seed = texelFetch(u_features, ivec2(i, BLOT_ROW + 1), 0).x;
    vec2 q = (p - blot.xy) / blot.zw;
    // A rounded rectangle (superellipse) rather than an ellipse, so it covers the
    // corners of the word it sits on.
    vec2 q2 = q * q;
    float r = sqrt(sqrt(q2.x * q2.x + q2.y * q2.y));
    if (r > 2.3) continue;
    float scale = min(blot.z, blot.w); // mm per unit of q, roughly
    float edge = (1.1 + 0.15 * fbm(q * 1.4 + seed, 3) - r) * scale;
    float body = clamp(edge * u_pxPerMm + 0.5, 0.0, 1.0);
    // Droplets thrown out around the blot, fewer further away.
    vec3 drop = worley(q * 5.0 + seed);
    float size = 0.25 * drop.y * step(0.6, drop.z) * (1.0 - smoothstep(1.0, 2.2, r));
    float droplet = clamp((size - drop.x) / 5.0 * scale * u_pxPerMm + 0.5, 0.0, 1.0) * step(0.01, size);
    ink = max(ink, max(body, droplet));
  }
  return ink;
}
