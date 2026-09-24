// Shared declarations for the surface pass, which builds a medium's height, colour
// and gloss maps. Positions are millimetres from the object's top-left corner, with
// y pointing down the image (like the text canvas).

#include "../lib/noise2d.glsl"
#include "../lib/fbm.glsl"
#include "../lib/cellular.glsl"
#include "../lib/util.glsl"

struct Surface {
  float height;    // mm relative to the object's face; cuts are negative
  vec3 albedo;     // sRGB colour of a flat, evenly lit patch
  float roughness; // 0 = polished, 1 = matte
  float alpha;     // 1 where the object exists, 0 where it's missing
  float metal;     // 1 for gold leaf, which reflects in its own colour
};

// How the writing was made (see media/writing.ts).
const int WRITING_CARVE = 0;
const int WRITING_PAINT = 1;
const int WRITING_BURN = 2;
const int WRITING_INK = 3;

// Rows of the features texture, two per kind (see damage/features.ts).
const int MAX_FEATURES = 64;
const int CHIP_ROW = 0;
const int STAIN_ROW = 2;
const int HOLE_ROW = 4;
const int BURN_ROW = 6;
const int TEAR_ROW = 8;
const int FOLD_ROW = 10;
const int SMUDGE_ROW = 12;
const int CUT_ROW = 14;
const int BLOT_ROW = 16;

uniform vec2 u_sizeMm;       // object size
uniform vec2 u_originMm;     // position of the render target's top-left corner
uniform float u_pxPerMm;
uniform vec2 u_materialSeed; // offsets into noise space, one per random aspect
uniform vec2 u_fadeSeed;
uniform vec2 u_damageSeed;
uniform float u_fade;        // 0..1
uniform float u_textSize;    // font size in mm; 0 when there's no text
uniform vec3 u_palette[4];   // the variant's colours; each medium says what they mean
uniform float u_grain;       // direction of wood grain or papyrus fibres, radians

// Writing.
uniform int u_writing;       // WRITING_*
uniform float u_flatCut;     // 1 for flat-bottomed grooves instead of a V-cut
uniform float u_fill;        // 1 when the grooves are filled with u_writingColor
uniform float u_gilt;        // 1 when that fill is gold leaf
uniform vec3 u_writingColor; // sRGB paint, gold or ink
uniform vec3 u_writingAged;  // sRGB colour of ink once aged

// Shape (see lib/shapes.glsl).
uniform int u_shape;
uniform vec4 u_shapeParams;

// Text.
uniform sampler2D u_textDistance;  // signed distance to letter edges in mm, > 0 inside
uniform sampler2D u_textMask;      // green = ink density around each word

// Damage.
uniform sampler2D u_features;      // damage features, one per texel column
uniform int u_chipCount;
uniform int u_stainCount;
uniform int u_holeCount;
uniform int u_burnCount;
uniform int u_tearCount;
uniform int u_foldCount;
uniform int u_smudgeCount;
uniform int u_cutCount;
uniform int u_blotCount;
// Areas kept clear of spread-out damage (words marked {{like this}}): x0, y0, x1, y1 in mm.
uniform vec4 u_protect[8];
uniform int u_protectCount;
uniform sampler2D u_crackDistance; // signed distance to cracks in mm, > 0 inside
uniform float u_hasCracks;
// Damage spread across the surface, 0..1 each.
uniform float u_soot;
uniform float u_lichen;
uniform float u_pitting;
uniform float u_flaking;
uniform float u_rot;
uniform float u_foxing;
uniform float u_fraying;
uniform float u_darkening;

vec2 textUv(vec2 p) {
  return (p - u_originMm) * u_pxPerMm / vec2(textureSize(u_textDistance, 0));
}

float textDistance(vec2 p) {
  return texture(u_textDistance, textUv(p)).r;
}

float inkDensity(vec2 p) {
  return texture(u_textMask, textUv(p)).g;
}

float crackDistance(vec2 p) {
  if (u_hasCracks < 0.5) return -1000.0;
  return texture(u_crackDistance, textUv(p)).r;
}

// Coverage of the object's outline, anti-aliased over one pixel. `inside` is the
// distance to the edge in mm, positive inside.
float coverageFrom(float inside) {
  return clamp(inside * u_pxPerMm + 0.5, 0.0, 1.0);
}

// How much of a texture detail of `size` mm to show: none when it would be smaller than
// about two pixels (it would only alias into speckle), all of it from four pixels up.
// This keeps a small preview clean while a 300 DPI print keeps the fine grain.
float detail(float size) {
  return smoothstep(2.0, 4.0, size * u_pxPerMm);
}

// 1 inside a protected area, fading out over a few mm around it.
float shielded(vec2 p) {
  float shield = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= u_protectCount) break;
    vec4 area = u_protect[i];
    vec2 outside = max(area.xy - p, p - area.zw);
    shield = max(shield, 1.0 - smoothstep(0.0, 3.0, max(outside.x, outside.y)));
  }
  return shield;
}

float hash1(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

// A pseudo-random value per pixel, for dithering sample positions.
float dither(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
