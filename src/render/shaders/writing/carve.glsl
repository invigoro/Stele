// V-cut lettering, as cut with a chisel held at a fixed angle.
//
// `d` is the signed distance to the letter edge in mm (> 0 inside). The cut deepens
// with distance from the edge until the two walls meet down the middle of the
// stroke, so wide strokes end up deeper than hairlines, as in real carving.
//
// Weathering lowers the face by `erosion` mm: anywhere the groove was shallower than
// that disappears, so hairlines and serifs vanish first. `rounding` (mm, > 0)
// softens the sharp edges.
float carveDepth(float d, float slope, float erosion, float rounding) {
  float depth = max(d, 0.0) * slope;
  return smax(0.0, depth - erosion, rounding);
}
