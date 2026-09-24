// Pen ink, drawn from the text distance field. Fading thins strokes and wears the
// ink away in patches; water makes it spread and run down the page.

// Iron-gall ink: blue-black when fresh, turning brown as it ages.
vec3 inkColor() {
  return mix(vec3(0.10, 0.09, 0.13), vec3(0.50, 0.36, 0.22), smoothstep(0.0, 1.0, u_fade));
}

// A gentle wobble applied to the letters, so repeated glyphs don't look stamped.
vec2 handWobble(vec2 p) {
  float scale = 1.7 * max(u_textSize, 1.0);
  vec2 q = p / scale + u_materialSeed;
  return 0.03 * max(u_textSize, 1.0) * vec2(snoise(q), snoise(q + vec2(17.0, 5.0)));
}

// How much ink is at p: 0 for bare paper, 1 for a solid, freshly inked stroke.
// `wet` (0..1) is how soaked the paper got.
float inkAmount(vec2 p, float wet) {
  if (u_textSize <= 0.0) return 0.0;
  vec2 w = p + handWobble(p);
  float px = 1.0 / u_pxPerMm;
  float patchy = 0.5 + 0.5 * fbm(p / 30.0 + u_fadeSeed, 3);
  float wear = clamp(u_fade * (0.3 + 0.9 * patchy), 0.0, 1.0);

  // Dry ink: crisp edges, a little darker along them where it pooled.
  float d = textDistance(w) - wear * 0.035 * u_textSize;
  float dry = smoothstep(-0.6 * px, 0.6 * px, d);
  float pooled = 1.0 + 0.2 * (1.0 - smoothstep(0.0, 0.06 * u_textSize + px, d));
  float density = inkDensity(w) * pooled;

  // Wet ink: feathered, diluted, and smeared downward from where it was written, in
  // drips of varying length. Sample offsets are dithered per pixel so the smear is
  // continuous rather than a stack of offset copies.
  if (wet > 0.001) {
    float spread = 0.03 * u_textSize * wet + px;
    float drip = 0.4 + 0.6 * (0.5 + 0.5 * snoise(vec2(p.x * 1.5, 3.1) + u_damageSeed));
    float length = 0.6 * u_textSize * wet * drip;
    float dither = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    float run = 0.0;
    float runDensity = 0.0;
    for (int i = 0; i < 16; i++) {
      float t = (float(i) + dither) / 16.0;
      vec2 q = w - vec2(0.0, t * length);
      float c = smoothstep(-spread, spread, textDistance(q) + 0.5 * spread) * pow(1.0 - t, 2.0);
      if (c > run) {
        run = c;
        runDensity = inkDensity(q);
      }
    }
    dry = mix(dry, run, wet);
    density = mix(density, runDensity * (1.0 - 0.55 * wet), wet);
  }

  // Worn ink flakes away in specks and patches. Below print resolution the specks
  // blur to their average, so a small preview isn't speckled.
  float specks = smoothstep(0.35, 0.75, 0.5 + 0.5 * snoise(p * 2.5 + u_fadeSeed * 13.0));
  specks = mix(0.3, specks, detail(0.4));
  density *= 1.0 - wear * (0.55 * patchy + 0.4 * specks);
  return clamp(dry * density, 0.0, 1.0);
}
