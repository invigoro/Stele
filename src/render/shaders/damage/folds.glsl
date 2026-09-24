// Folds, read from the features texture (FOLD_ROW: ax, ay, bx, by; +1: seed, strength).

struct Folding {
  float crease; // 0..1, the crease line itself
  float wear;   // 0..1, the band either side where handling wore the surface
  float height; // mm, a ridge on one side of the crease and a dip on the other
  float hole;   // 0..1, where two creases cross and the sheet wore through
};

Folding foldsAt(vec2 p) {
  Folding result = Folding(0.0, 0.0, 0.0, 0.0);
  float crossed = 0.0;
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_foldCount) break;
    vec4 line = texelFetch(u_features, ivec2(i, FOLD_ROW), 0);
    vec4 more = texelFetch(u_features, ivec2(i, FOLD_ROW + 1), 0);
    vec2 along = normalize(line.zw - line.xy);
    vec2 normal = vec2(-along.y, along.x);
    float t = dot(p - line.xy, along);
    // Creases wander a little from a perfect line.
    float d = dot(p - line.xy, normal) + 0.25 * snoise(vec2(t / 15.0, more.x));
    float strength = more.y;
    float line2 = exp(-d * d / 0.12);
    float band = exp(-d * d / 2.2);
    result.crease = max(result.crease, line2 * strength);
    result.wear = max(result.wear, band * strength);
    result.height += 0.12 * strength * (d / 0.6) * exp(-d * d / 0.8);
    result.hole = max(result.hole, crossed * band * strength);
    crossed = max(crossed, band);
  }
  return result;
}
