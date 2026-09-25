// Bronze (or brass): a cast plaque, dark with patina where it's recessed and rubbed
// bright on its raised letters and rim.
// Palette: 0 bright metal, 1 patina, 2 verdigris, 3 grime.

const float CORNER_RADIUS = 3.0;
const float RIM = 7.0;
const float RELIEF = 1.2;
const float ENGRAVE_SLOPE = 0.9;

// Slow, cloudy variation in the metal and how the patina took.
float castTone(vec2 p) {
  return fbm(p / 14.0 + u_materialSeed * 3.0, 3);
}

#include "metal.glsl"
