// Straight cuts across the object, made ragged: torn-off pieces of a sheet, or big
// breaks that turn a slab into a fragment. Read from the features texture (`row`:
// ax, ay, bx, by; +1: seed). Each removes whatever lies on the far side of its line
// from the object's centre.

// How far past the nearest cut line p lies, mm: positive where a cut removed the
// material. `ragged` (mm) is how far the edge wanders; `scale` (mm) the length of its
// wiggles; `fine` (0..1) how much small-scale jaggedness rides on them.
float cutsAt(vec2 p, int row, int count, float ragged, float scale, float fine) {
  float removed = -1000.0;
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= count) break;
    vec4 line = texelFetch(u_features, ivec2(i, row), 0);
    float seed = texelFetch(u_features, ivec2(i, row + 1), 0).x;
    vec2 along = normalize(line.zw - line.xy);
    vec2 normal = vec2(along.y, -along.x);
    if (dot(0.5 * u_sizeMm - line.xy, normal) > 0.0) normal = -normal; // point away from the centre
    float t = dot(p - line.xy, along);
    float d = dot(p - line.xy, normal);
    d += ragged * (fbm(vec2(t / scale, seed), 4) + fine * snoise(vec2(t / (0.15 * scale), seed * 3.1)));
    removed = max(removed, d);
  }
  return removed;
}
