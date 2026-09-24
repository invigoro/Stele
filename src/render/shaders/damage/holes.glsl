// Holes: worm holes, nail holes, gaps in papyrus. Read from the features texture
// (HOLE_ROW: x, y, rx, ry; +1: seed, angle).

// How far inside the nearest hole p is, mm (negative outside every hole). `ragged`
// (mm) roughens the outlines.
float holesAt(vec2 p, float ragged) {
  float inside = -1000.0;
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_holeCount) break;
    vec4 hole = texelFetch(u_features, ivec2(i, HOLE_ROW), 0);
    vec4 more = texelFetch(u_features, ivec2(i, HOLE_ROW + 1), 0);
    vec2 q = p - hole.xy;
    float reach = max(hole.z, hole.w) * 1.5 + ragged;
    if (dot(q, q) > reach * reach) continue;
    float c = cos(more.y);
    float s = sin(more.y);
    vec2 local = vec2(c * q.x + s * q.y, -s * q.x + c * q.y) / hole.zw;
    // Roughly the distance to the ellipse's edge, in mm.
    float edge = (1.0 - length(local)) * min(hole.z, hole.w);
    edge += ragged * snoise(q / max(0.6 * min(hole.z, hole.w), 0.3) + more.x);
    inside = max(inside, edge);
  }
  return inside;
}
