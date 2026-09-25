// Damage painted by hand (see damage/paint.ts): soft-edged masks that each medium turns
// into its own kind of damage.

// How much of each kind of painted damage covers a point, 0..1, soft at the edges.
struct PaintedDamage {
  float breakage; // chips, gouges and holes ("break" is a reserved word)
  float wear;
  float stain;    // stains, rot and water
  float burn;
  float growth;   // moss
};

// Painted damage at p. The lookup is displaced by noise, so brush strokes come out as
// irregular blobs rather than the neat capsules the brush drew.
PaintedDamage paintAt(vec2 p) {
  if (u_hasPaint < 0.5) return PaintedDamage(0.0, 0.0, 0.0, 0.0, 0.0);
  vec2 warp = 3.0 * vec2(fbm(p / 10.0 + u_damageSeed * 1.7, 3), fbm(p / 10.0 + u_damageSeed * 2.9 + 5.0, 3))
            + 0.8 * vec2(snoise(p / 2.5 + u_damageSeed), snoise(p / 2.5 + u_damageSeed + 9.0)) * detail(0.6);
  vec2 uv = textUv(p + warp);
  vec3 first = textureLod(u_paint, uv, 0.0).rgb;
  vec2 second = textureLod(u_paint2, uv, 0.0).rg;
  return PaintedDamage(first.r, first.g, first.b, second.r, second.g);
}

// A ragged-edged version of a soft painted mask, for damage with a definite edge (holes,
// chips, char): noise moves where the edge falls. `scale` (mm) sets the size of the wiggles.
float raggedEdge(float coverage, vec2 p, float scale) {
  if (coverage <= 0.0) return 0.0;
  float n = fbm(p / scale + u_damageSeed * 2.7, 3) + 0.3 * snoise(p / (0.25 * scale) + u_damageSeed) * detail(0.25 * scale);
  return smoothstep(0.45, 0.55, coverage + 0.3 * n);
}

// A soft version of a painted mask, for damage that fades in gradually (wear, stains).
float softEdge(float coverage) {
  return smoothstep(0.1, 0.85, coverage);
}
