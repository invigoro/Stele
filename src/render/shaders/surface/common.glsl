// Shared declarations for the surface pass, which builds a medium's height, colour
// and gloss maps. Positions are millimetres from the object's top-left corner, with
// y pointing down the image (like the text canvas).

#include "../lib/noise2d.glsl"
#include "../lib/fbm.glsl"
#include "../lib/util.glsl"

struct Surface {
  float height;    // mm relative to the object's face; cuts are negative
  vec3 albedo;     // sRGB colour of a flat, evenly lit patch
  float roughness; // 0 = polished, 1 = matte
  float alpha;     // 1 where the object exists, 0 where it's missing
};

uniform vec2 u_sizeMm;       // object size
uniform vec2 u_originMm;     // position of the render target's top-left corner
uniform float u_pxPerMm;
uniform vec2 u_materialSeed; // offsets into noise space, one per random aspect
uniform vec2 u_fadeSeed;
uniform vec2 u_damageSeed;
uniform float u_fade;        // 0..1
uniform float u_damage;      // 0..1
uniform float u_textSize;    // font size in mm; 0 when there's no text

uniform sampler2D u_textDistance; // signed distance to letter edges in mm, > 0 inside
uniform sampler2D u_textMask;     // green = ink density around each word
uniform sampler2D u_features;     // damage features, one per texel column
uniform int u_chipCount;
uniform int u_stainCount;

vec2 textUv(vec2 p) {
  return (p - u_originMm) * u_pxPerMm / vec2(textureSize(u_textDistance, 0));
}

float textDistance(vec2 p) {
  return texture(u_textDistance, textUv(p)).r;
}

float inkDensity(vec2 p) {
  return texture(u_textMask, textUv(p)).g;
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
