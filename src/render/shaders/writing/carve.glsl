// Carved lettering.
//
// `d` is the signed distance to the letter edge in mm (> 0 inside). A V-cut, made with
// a chisel held at a fixed angle, deepens with distance from the edge until the two
// walls meet down the middle of the stroke, so wide strokes end up deeper than
// hairlines. A flat-bottomed cut has near-vertical walls and a level floor
// `flatDepth` mm down (u_flatCut selects it).
//
// Weathering lowers the face by `erosion` mm: anywhere the groove was shallower than
// that disappears, so hairlines and serifs vanish first. `rounding` (mm, > 0)
// softens the sharp edges. No cut goes deeper than a third of the text size, so the
// broad shapes of a picture are cut out flat rather than through the slab.
float carveDepth(float d, float slope, float erosion, float rounding, float flatDepth) {
  float depth = min(max(d, 0.0) * slope, 0.33 * u_textSize);
  if (u_flatCut > 0.5) depth = min(depth * 3.0, flatDepth);
  return smax(0.0, depth - erosion, rounding);
}

// How much of the paint or gold laid into a groove survives, 0..1: it hangs on longest
// down in the deepest parts of the cut.
float fillKept(vec2 p, float cut, float wear) {
  float depth = cut / max(0.1 * u_textSize, 0.1);
  return smoothstep(0.1, 0.4, depth + 0.3 * snoise(p / 1.2 + u_fadeSeed) - 1.2 * wear);
}
