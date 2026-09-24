// Marble: a polished white slab with soft grey veins, V-cut lettering and chips.

#include "../writing/carve.glsl"
#include "../damage/chips.glsl"

const float CORNER_RADIUS = 2.0; // mm
const float BEVEL = 2.0;         // mm, width of the rounded front edge
const float CHISEL_SLOPE = 1.5;  // groove depth per mm in from the letter edge

vec3 marbleColor(vec2 p) {
  vec2 q = p / 60.0 + u_materialSeed;
  // Veins lie on the zero crossings of a wave running across the slab, bent by
  // turbulence into long, wandering sweeps. They fade in and out along their length.
  float angle = u_materialSeed.x * 0.37;
  vec2 across = vec2(cos(angle), sin(angle));
  float wave = sin(dot(q, across) * 3.0 + 3.5 * fbm(q * 1.2, 5));
  float strength = smoothstep(-0.3, 0.7, fbm(q * 0.9 + vec2(2.3, 8.1), 3));
  float ridge = 1.0 - abs(wave);
  float vein = strength * pow(ridge, 6.0);
  float halo = strength * pow(ridge, 1.5);
  // Fainter, finer veins crossing at another angle.
  float fine = 1.0 - abs(sin(dot(q, vec2(-across.y, across.x)) * 5.0 + 4.0 * fbm(q * 1.8 + 7.0, 5)));
  float hairline = pow(fine, 60.0) * smoothstep(-0.2, 0.6, fbm(q * 1.3 + 3.0, 2));

  float cloud = fbm(q * 0.5 + vec2(11.0, 4.0), 4);
  vec3 color = mix(vec3(0.94, 0.935, 0.915), vec3(0.87, 0.865, 0.85), 0.5 + 0.5 * cloud);
  color = mix(color, vec3(0.80, 0.80, 0.82), 0.35 * halo);
  color = mix(color, vec3(0.58, 0.59, 0.63), 0.5 * vein);
  color = mix(color, vec3(0.68, 0.68, 0.71), 0.25 * hairline);
  // Crystalline sparkle at a fraction of a millimetre.
  return color * (1.0 + 0.03 * snoise(p * 3.0 + u_materialSeed * 17.0) * detail(0.33));
}

void buildSurface(vec2 p, inout Surface s) {
  float inside = -sdRoundedBox(p - 0.5 * u_sizeMm, 0.5 * u_sizeMm, CORNER_RADIUS);
  s.alpha = coverageFrom(inside);
  // A shallow rounded arris along the front edge.
  float b = clamp(1.0 - inside / BEVEL, 0.0, 1.0);
  s.height = -0.5 * BEVEL * (1.0 - sqrt(max(1.0 - b * b, 0.0)));
  s.albedo = marbleColor(p);
  s.roughness = 0.3;

  // Weathering: the face wears down unevenly and the polish gives way to a sugary,
  // granular texture.
  float patchy = 0.5 + 0.5 * fbm(p / 45.0 + u_fadeSeed, 3);
  float wear = u_fade * (0.35 + 0.9 * patchy);
  s.height += u_fade * 0.04 * fbm(p / 0.7 + u_fadeSeed * 3.0, 3) * detail(0.7);
  s.roughness = mix(s.roughness, 0.85, u_fade);
  s.albedo *= 1.0 - 0.06 * u_fade * patchy;

  if (u_textSize > 0.0) {
    // Eases in, so light fading only takes the hairlines and heavy fading the rest.
    float erosion = pow(wear, 1.3) * 0.09 * u_textSize;
    float cut = carveDepth(textDistance(p), CHISEL_SLOPE, erosion, 0.04 * u_textSize * (0.3 + u_fade));
    s.height -= cut;
    // Freshly cut grooves are whiter; old ones hold a little grime.
    s.albedo *= mix(1.0, mix(1.05, 0.92, u_fade), smoothstep(0.0, 0.3, cut));
  }

  Chipping chips = chipsAt(p);
  s.height = min(s.height, -chips.depth);
  s.albedo = mix(s.albedo, s.albedo * 1.03 + 0.02, 0.8 * chips.fresh);
  s.roughness = mix(s.roughness, 0.9, chips.fresh);
  s.alpha *= 1.0 - chips.missing;
}
