// Chips: scars where flakes broke away, read from the features texture
// (CHIP_ROW: x, y, radius, depth in mm; +1: seed, breaks-through flag, angle, aspect).

// Outline of an irregular polygon, as a fraction of the chip's radius in the direction
// `angle` (radians): broken stone has corners, not the soft lobes of plain noise.
float polygonRadius(float angle, float seed) {
  float sides = 5.0 + floor(hash1(seed) * 4.0);
  float sector = (angle / 6.2831853 + 0.5) * sides;
  float k = floor(sector);
  float a = 0.65 + 0.45 * hash1(seed + mod(k, sides) * 7.13);
  float b = 0.65 + 0.45 * hash1(seed + mod(k + 1.0, sides) * 7.13);
  return mix(a, b, sector - k);
}

struct Chipping {
  float depth;   // mm below the face; 0 where the face is intact
  float fresh;   // 1 on newly exposed material, which is paler than the weathered face
  float missing; // 1 where a chip broke right through and the object is gone
};

Chipping chipsAt(vec2 p) {
  Chipping result = Chipping(0.0, 0.0, 0.0);
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_chipCount) break;
    vec4 chip = texelFetch(u_features, ivec2(i, CHIP_ROW), 0);
    vec4 more = texelFetch(u_features, ivec2(i, CHIP_ROW + 1), 0);
    vec2 q = p - chip.xy;
    if (dot(q, q) > chip.z * chip.z * 2.25) continue;

    // A flake is a stretched, irregular polygon with a slightly ragged rim.
    float c = cos(more.z);
    float s = sin(more.z);
    vec2 local = vec2(c * q.x + s * q.y, -s * q.x + c * q.y) * vec2(1.0, more.w);
    float r = length(local);
    vec2 direction = local / max(r, 1.0e-4);
    float outline = chip.z * polygonRadius(atan(local.y, local.x), more.x)
                  * (1.0 + 0.08 * fbm(direction * 2.0 + more.x, 2));
    outline += 0.02 * chip.z * snoise(p / (0.12 * chip.z) + more.x) * detail(0.12 * chip.z);
    float t = r / max(outline, 1.0e-4);
    if (t >= 1.0) continue;

    float depth;
    if (more.y > 0.5) {
      // Broke right through: the middle is gone, leaving a steep broken face.
      float hole = clamp((0.8 * outline - r) * u_pxPerMm + 0.5, 0.0, 1.0);
      result.missing = max(result.missing, hole);
      float face = clamp((t - 0.8) / 0.2, 0.0, 1.0); // 0 at the hole, 1 at the rim
      depth = chip.w * pow(1.0 - face, 1.5);
    } else {
      // Conchoidal fracture: a smooth shell-shaped hollow, steepest at the rim, with
      // faint concentric ripples.
      depth = chip.w * sqrt(1.0 - t * t) * (1.0 + 0.007 * sin(t * 24.0 + more.x));
    }
    result.depth = max(result.depth, depth);
    result.fresh = max(result.fresh, smoothstep(1.0, 0.9, t));
  }
  return result;
}
