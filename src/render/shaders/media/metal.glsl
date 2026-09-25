// Shared behaviour of metal media: a cast plaque with a raised rim and corner bolts,
// lettering cast in relief or engraved, a dark patina rubbed bright on everything
// that stands proud, verdigris, corrosion pits, scratches, dents and corrosion crust.
// The medium defines, before including this file:
//   float castTone(vec2 p)       -1..1, slow mottling of the metal and its patina
//   const float CORNER_RADIUS    mm
//   const float RIM              mm, width of the raised border
//   const float RELIEF           mm, how far letters and border stand above the field
//   const float ENGRAVE_SLOPE    engraved groove depth per mm in from the letter edge
// Palette: 0 bright metal, 1 patina, 2 verdigris, 3 grime.
//
// Damage features are read as metal suffers them: chips are dents, cracks are
// scratches, and blots (over words marked [[like this]]) are crusts of corrosion.

#include "../lib/shapes.glsl"
#include "../writing/carve.glsl"
#include "../damage/painted.glsl"

const float BOLT = 2.6; // mm, radius of a bolt head

// Dents, from the chip features (CHIP_ROW: x, y, radius, depth; +1: seed, -, angle,
// aspect): smooth hollows, deepest in the middle. Returns their depth, mm.
float dentsAt(vec2 p) {
  float depth = 0.0;
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_chipCount) break;
    vec4 dent = texelFetch(u_features, ivec2(i, CHIP_ROW), 0);
    vec4 more = texelFetch(u_features, ivec2(i, CHIP_ROW + 1), 0);
    vec2 q = p - dent.xy;
    if (dot(q, q) > dent.z * dent.z) continue;
    float c = cos(more.z);
    float s = sin(more.z);
    vec2 local = vec2(c * q.x + s * q.y, -s * q.x + c * q.y) * vec2(1.0, more.w);
    float t = length(local) / dent.z;
    float bowl = max(1.0 - t * t, 0.0);
    depth = max(depth, dent.w * bowl * bowl);
  }
  return depth;
}

// Crusts over words marked [[like this]], from the blot features (BLOT_ROW: x, y, rx,
// ry; +1: seed): corrosion built up so thick the letters under it are lost. 0..1.
float crustAt(vec2 p) {
  float crust = 0.0;
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_blotCount) break;
    vec4 blot = texelFetch(u_features, ivec2(i, BLOT_ROW), 0);
    float seed = texelFetch(u_features, ivec2(i, BLOT_ROW + 1), 0).x;
    vec2 q = (p - blot.xy) / blot.zw;
    vec2 q2 = q * q;
    float r = sqrt(sqrt(q2.x * q2.x + q2.y * q2.y)); // squarish, to cover the word
    if (r > 1.6) continue;
    float edge = (1.15 + 0.2 * fbm(q * 1.6 + seed, 3) - r) * min(blot.z, blot.w);
    crust = max(crust, smoothstep(0.0, 0.6, edge));
  }
  return crust;
}

// Corrosion pits in clusters: x = depth (mm), y = the pale green powder ringing them.
vec2 pitsAt(vec2 p) {
  if (u_pitting <= 0.0) return vec2(0.0);
  float cluster = smoothstep(0.55, 0.85, 0.5 + 0.5 * fbm(p / 25.0 + u_damageSeed * 2.3, 3));
  vec3 cell = worley(p / 2.2 + u_damageSeed);
  float present = step(cell.z, 0.8 * u_pitting * (0.05 + 0.95 * cluster));
  float r = 0.1 + 0.18 * cell.y;
  float pit = present * smoothstep(r, 0.4 * r, cell.x);
  float ring = present * smoothstep(1.7 * r, 1.1 * r, cell.x) * (1.0 - pit);
  return vec2(0.2 * pit, ring);
}

// Verdigris: green corrosion where water lies, against the relief (`foot`), in streaks
// run down from the letters and the top rim, and in broad patches. 0..1.
float verdigrisAt(vec2 p, float foot) {
  if (u_verdigris <= 0.0) return 0.0;
  float streak = 0.0;
  for (int k = 1; k <= 5; k++) {
    float up = 2.5 * float(k);
    float above = max(step(0.0, textDistance(p - vec2(0.0, up))), step(p.y - up, RIM + 1.0));
    streak = max(streak, above * (1.0 - float(k) / 6.0));
  }
  streak *= smoothstep(0.35, 0.8, 0.5 + 0.5 * fbm(vec2(p.x / 1.8, p.y / 30.0) + u_damageSeed, 3));
  float patches = smoothstep(0.5, 0.85, 0.5 + 0.5 * fbm(p / 20.0 + u_damageSeed * 1.3, 3));
  float amount = u_verdigris * (1.1 * foot + 0.8 * streak + 0.6 * patches);
  return smoothstep(0.3, 0.55, amount + 0.25 * fbm(p / 1.2 + u_damageSeed * 2.1, 3));
}

// Bolt heads at the corners of a rectangular plaque, domed and slotted: x = height above
// the rim (mm), y = 1 on the head.
vec2 boltAt(vec2 p) {
  if (u_shape != SHAPE_RECTANGLE) return vec2(0.0);
  vec2 q = min(p, u_sizeMm - p) - vec2(0.5 * (1.5 + RIM)); // every corner folded onto the first
  float r = length(q);
  if (r > BOLT) return vec2(0.0);
  float t = r / BOLT;
  float dome = sqrt(max(1.0 - t * t, 0.0));
  float turn = 3.14159 * hash1(dot(floor(2.0 * p / u_sizeMm), vec2(3.0, 7.0)) + u_materialSeed.x);
  float slot = (1.0 - smoothstep(0.22, 0.38, abs(dot(q, vec2(-sin(turn), cos(turn)))))) * step(t, 0.8);
  return vec2(0.9 * dome - 0.35 * slot, smoothstep(1.0, 0.92, t));
}

void buildSurface(vec2 p, inout Surface s) {
  float inside = -outlineDistance(p, CORNER_RADIUS);
  s.alpha = coverageFrom(inside);
  // The edge is rounded over, and a raised rim runs round inside it.
  float roll = 1.0 - smoothstep(0.0, 1.5, inside);
  float rimTop = 1.0 - smoothstep(RIM, RIM + 0.6, inside);
  s.height = RELIEF * (1.0 - smoothstep(RIM, RIM + 1.2, inside)) - roll * roll;
  rimTop *= 1.0 - roll;
  vec2 bolt = boltAt(p);
  s.height = mix(s.height, RELIEF + bolt.x, bolt.y);
  float face = s.height;

  PaintedDamage painted = paintAt(p);
  float worn = softEdge(painted.wear); // painted "wear smooth"
  float dented = smoothstep(0.0, 1.0, painted.breakage); // painted "dent"

  // Age rounds the letters off and wears the relief lower.
  float patchy = 0.5 + 0.5 * fbm(p / 40.0 + u_fadeSeed, 3);
  float wear = clamp(u_fade * (0.4 + 0.8 * patchy), 0.0, 1.0);
  float d = textDistance(p);
  float letters = 0.0; // 1 on the faces of letters cast in relief
  float cut = 0.0;     // depth of engraving
  if (u_textSize > 0.0) {
    if (u_writing == WRITING_RELIEF) {
      float bevel = 0.2 + 0.015 * u_textSize;
      float rounding = 0.05 * u_textSize * wear + 0.08 * u_textSize * worn;
      letters = smoothstep(-bevel, bevel + rounding, d);
      s.height += RELIEF * (1.0 - 0.3 * wear) * (1.0 - 0.75 * worn) * (1.0 - 0.7 * dented) * letters;
    } else {
      float erosion = pow(wear, 1.3) * 0.05 * u_textSize + worn * 0.08 * u_textSize;
      cut = carveDepth(d, ENGRAVE_SLOPE, erosion, 0.02 * u_textSize * (0.3 + u_fade), 0.05 * u_textSize);
      s.height -= cut;
    }
  }
  float inCut = smoothstep(0.0, 0.15, cut);

  // Whatever stands proud gets rubbed bright by hands and polishing cloths (for
  // engraving, the whole face outside the grooves); the rest darkens to patina, and
  // with age the bright metal dulls too. Rubbing a patch smooth polishes it all.
  float tone = castTone(p);
  float proud = u_writing == WRITING_RELIEF ? max(max(letters, rimTop), bolt.y) : 1.0 - inCut;
  float dull = smoothstep(0.0, 0.8, wear + 0.25 * tone);
  float shine = max(proud * mix(1.0, 0.25, dull), 0.8 * worn);
  vec3 bright = u_palette[0] * (0.9 + 0.15 * tone);
  vec3 patina = u_palette[1] * (0.85 + 0.25 * tone) * (1.0 + 0.08 * snoise(p / 0.5 + u_materialSeed) * detail(0.5));
  s.albedo = mix(patina, bright, shine);
  s.metal = mix(0.25, 1.0, shine);
  s.roughness = mix(0.6, 0.22, shine);
  // The field keeps the pebbly texture of the sand mould.
  s.height += 0.035 * fbm(p / 0.5 + u_materialSeed, 2) * detail(0.5) * (1.0 - proud) * (1.0 - roll);

  // Engraved grooves: bright when freshly cut, darkening with dirt as they age, or
  // filled with enamel that chips out of the shallow parts first.
  if (inCut > 0.0) {
    s.albedo = mix(s.albedo, mix(bright * 0.85, u_palette[3], 0.3 + 0.6 * u_fade), inCut);
    if (u_fill > 0.5) {
      float fill = inCut * fillKept(p, cut, wear + worn);
      s.albedo = mix(s.albedo, u_writingColor, fill);
      s.metal = mix(s.metal, 0.0, fill);
      s.roughness = mix(s.roughness, 0.45, fill);
    }
  }

  // Grime gathers where the field meets the relief.
  float foot = u_writing == WRITING_RELIEF ? smoothstep(-1.0, 0.0, d) * (1.0 - letters) : 0.0;
  foot = max(foot, smoothstep(RIM + 2.2, RIM + 1.0, inside) * (1.0 - rimTop));
  s.albedo = mix(s.albedo, u_palette[3], 0.45 * foot);

  // Dents, from blows and painted on: a blow squashes the letters it lands on.
  s.height -= dentsAt(p) + 1.6 * dented;

  // Scratches: shallow score marks down to bright metal, dulling with age.
  float scratch = smoothstep(-0.02, 0.04, crackDistance(p));
  s.height -= 0.06 * scratch;
  s.albedo = mix(s.albedo, bright * 1.05, scratch * (1.0 - 0.6 * u_fade));
  s.metal = max(s.metal, 0.9 * scratch);
  s.roughness = mix(s.roughness, 0.35, scratch);

  // Corrosion pits with pale green powder round them.
  vec2 pit = pitsAt(p);
  s.height -= pit.x;
  s.albedo = mix(s.albedo, u_palette[3], smoothstep(0.0, 0.1, pit.x));
  s.albedo = mix(s.albedo, min(u_palette[2] * 1.3 + 0.08, vec3(1.0)), 0.45 * pit.y);
  s.metal *= 1.0 - max(smoothstep(0.0, 0.1, pit.x), 0.45 * pit.y);

  // Verdigris: a thin green film where water lies, and thick crusts over marked words
  // and wherever it was painted on, burying the letters.
  vec3 green = u_palette[2] * (0.85 + 0.3 * fbm(p / 2.0 + u_damageSeed * 4.3, 3)) * (0.92 + 0.16 * snoise(p / 0.4 + u_damageSeed) * detail(0.4));
  float film = verdigrisAt(p, foot);
  s.albedo = mix(s.albedo, green, film);
  s.metal *= 1.0 - film;
  s.roughness = mix(s.roughness, 0.95, film);
  s.height += 0.04 * film * fbm(p / 0.8 + u_damageSeed, 2);
  float crust = max(crustAt(p), raggedEdge(painted.stain, p, 3.0));
  if (crust > 0.0) {
    float lumps = 0.5 + 0.5 * fbm(p / 1.1 + u_damageSeed * 5.1, 3);
    s.height = mix(s.height, face + RELIEF + 0.25 + 0.6 * lumps, crust);
    s.albedo = mix(s.albedo, mix(green * 0.85, min(green * 1.2 + 0.06, vec3(1.0)), lumps), crust);
    s.metal *= 1.0 - crust;
    s.roughness = mix(s.roughness, 1.0, crust);
  }

  // Scorching: heat tints the metal through straw and purple to blue, with soot where
  // it was hottest.
  float heat = softEdge(painted.burn);
  if (heat > 0.0) {
    vec3 tint = heat < 0.5 ? mix(vec3(1.0), vec3(1.05, 0.88, 0.6), 2.0 * heat)
                           : mix(vec3(0.8, 0.5, 0.7), vec3(0.45, 0.5, 0.8), 2.0 * heat - 1.0);
    s.albedo *= tint;
    float soot = smoothstep(0.65, 1.0, painted.burn + 0.2 * fbm(p / 4.0 + u_damageSeed * 3.1, 3));
    s.albedo = mix(s.albedo, s.albedo * 0.15 + vec3(0.02), 0.75 * soot);
    s.metal *= 1.0 - soot;
    s.roughness = mix(s.roughness, 0.9, soot);
  }
}
