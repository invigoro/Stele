// Cellular (Worley) noise: one random feature point per unit cell.

vec2 cellHash(vec2 cell) {
  vec2 p = vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Distance to the nearest feature point (x), and a random value pair for that
// point's cell (yz), so each cell can be given its own size or colour.
vec3 worley(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = p - cell;
  float best = 8.0;
  vec2 bestHash = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 h = cellHash(cell + offset);
      vec2 d = offset + h - f;
      float distance2 = dot(d, d);
      if (distance2 < best) {
        best = distance2;
        bestHash = cellHash(cell + offset + 17.0);
      }
    }
  }
  return vec3(sqrt(best), bestHash);
}
