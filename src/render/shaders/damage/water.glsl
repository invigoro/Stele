// Water stains: irregular blotches with a dark tideline where the water dried, read
// from the features texture (STAIN_ROW: x, y, radius, strength; +1: seed).

struct Water {
  float wet;  // 0..1, how soaked the sheet got
  float tide; // 0..1, darkening from tidelines
};

Water waterAt(vec2 p) {
  Water water = Water(0.0, 0.0);
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_stainCount) break;
    vec4 stain = texelFetch(u_features, ivec2(i, STAIN_ROW), 0);
    float seed = texelFetch(u_features, ivec2(i, STAIN_ROW + 1), 0).x;
    vec2 q = p - stain.xy;
    float r = length(q);
    if (r > stain.z * 1.6) continue;

    float outline = stain.z * (1.0 + 0.3 * fbm(q / stain.z * 1.3 + seed, 4));
    float gap = outline - r; // mm inside the stain's edge
    if (gap < -1.0) continue;
    float inside = smoothstep(-0.3, 1.5, gap);
    // A dark ring at the edge, and a fainter one further in from an earlier drying.
    float edgeRing = gap / 0.7;
    float innerRing = (gap - 0.18 * stain.z) / 1.2;
    float tide = exp(-edgeRing * edgeRing) + 0.35 * exp(-innerRing * innerRing);
    water.wet = max(water.wet, inside * stain.w);
    water.tide = max(water.tide, clamp(tide, 0.0, 1.0) * stain.w * step(-0.3, gap));
  }
  return water;
}
