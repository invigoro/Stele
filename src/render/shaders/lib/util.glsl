// Small shared helpers.

// Polynomial smooth maximum: like max(a, b) but rounded over a blend width k (> 0).
float smax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}

// Signed distance to a rounded rectangle centred on the origin: negative inside.
float sdRoundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}
