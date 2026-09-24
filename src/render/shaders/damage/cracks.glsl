// Cracks (and splits along wood grain), from their distance field.

// How deep the crack is at p, mm. `dirt` (0..1) is how much grime darkens the crack
// and its edges.
float crackDepth(vec2 p, out float dirt) {
  float d = crackDistance(p);
  dirt = 0.0;
  if (d < -2.0) return 0.0;
  // Rough, slightly crumbled edges.
  d += 0.06 * snoise(p * 1.3 + u_damageSeed) + 0.03 * snoise(p * 4.0 + u_damageSeed) * detail(0.25);
  dirt = smoothstep(-0.5, 0.15, d);
  return clamp(d * 5.0, 0.0, 2.5);
}
