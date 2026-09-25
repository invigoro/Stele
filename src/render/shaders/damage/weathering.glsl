// Weathering spread across a stone face: lichen, soot and runoff stains, honeycomb
// pitting and flaking. Each is driven by its u_* amount (0..1).

struct Growth {
  float cover;  // 0..1
  vec3 color;
  float height; // mm
};

// Lichen: lobed colonies of a few species, gathered where the stone stays damp (in
// broad patches, and low down), each with a paler rim and a cracked, crusty middle.
Growth lichenAt(vec2 p) {
  if (u_lichen <= 0.0) return Growth(0.0, vec3(0.0), 0.0);
  float damp = 0.5 + 0.5 * fbm(p / 70.0 + u_damageSeed * 0.9, 3);
  damp += 0.35 * smoothstep(0.4, 1.0, p.y / u_sizeMm.y);
  vec3 cell = worley(p / 20.0 + u_damageSeed * 0.37);
  float present = step(cell.z, u_lichen * (damp - 0.3) * 1.1);
  // Mostly small colonies with the odd large one; neighbours can merge. Radius in cells.
  float size = (0.12 + 0.5 * cell.y * cell.y) * (0.6 + 0.8 * u_lichen);
  float edge = size - cell.x + 0.12 * fbm(p / 2.5 + cell.yz * 40.0, 3);
  float cover = present * smoothstep(0.0, 0.02, edge);
  if (cover <= 0.0) return Growth(0.0, vec3(0.0), 0.0);

  float species = hash1(cell.y * 91.3 + cell.z * 17.1);
  vec3 color = species < 0.55 ? vec3(0.58, 0.61, 0.52) : species < 0.8 ? vec3(0.74, 0.58, 0.32) : vec3(0.78, 0.79, 0.75);
  float rim = 1.0 - smoothstep(0.0, 0.05, edge);
  color = mix(color, min(color * 1.12 + 0.03, vec3(1.0)), 0.6 * rim);
  // The crust cracks into little plates.
  float plates = smoothstep(0.35, 0.5, worley(p / 0.9 + 3.0).x) * detail(0.9);
  color *= 1.0 - 0.18 * plates;
  return Growth(cover, color, cover * (0.12 + 0.06 * snoise(p * 1.5)));
}

// The height of a round cushion in a worley cell (0 at its rim, 1 on top), `radius` in
// cells. Keep radii under half a cell, or cushions get cut off where cells meet.
float cushion(vec3 cell, float radius) {
  float t = cell.x / max(radius, 0.001);
  return sqrt(max(1.0 - t * t, 0.0));
}

// Moss painted on by hand (`painted` is its coverage): a low mat crowded with rounded
// cushions, big and small, which shrink and stand apart toward the edge of the paint.
Growth mossAt(vec2 p, float painted) {
  if (painted <= 0.0) return Growth(0.0, vec3(0.0), 0.0);
  float depth = painted + 0.4 * fbm(p / 6.0 + u_damageSeed * 1.9, 3) + 0.12 * fbm(p / 2.0 + u_damageSeed * 5.3, 2);
  float grown = smoothstep(0.05, 0.65, depth);
  vec3 big = worley(p / 5.0 + u_damageSeed * 0.61);
  vec3 small = worley(p / 2.2 + u_damageSeed * 1.37);
  float bigDome = cushion(big, (0.25 + 0.2 * big.y) * grown);
  float smallDome = cushion(small, (0.2 + 0.2 * small.y) * grown) * step(0.4, small.z);
  float dome = max(bigDome, smallDome);
  float cover = max(smoothstep(0.45, 0.52, depth), smoothstep(0.0, 0.2, dome));
  if (cover <= 0.0) return Growth(0.0, vec3(0.0), 0.0);

  // Deep green to yellowish in broad patches and browned off in places; each cushion a
  // little different, paler on top and darker down between them.
  float shoots = snoise(p / 0.3 + u_damageSeed) * detail(0.3);
  float hue = 0.5 + 0.5 * fbm(p / 10.0 + u_damageSeed * 2.3, 3);
  vec3 color = mix(vec3(0.2, 0.28, 0.09), vec3(0.48, 0.53, 0.2), hue);
  float browned = smoothstep(0.6, 0.85, 0.5 + 0.5 * fbm(p / 16.0 + u_damageSeed * 3.7, 2));
  color = mix(color, vec3(0.46, 0.4, 0.25), 0.65 * browned);
  color *= (0.92 + 0.16 * (bigDome > smallDome ? big.z : small.z)) * (0.72 + 0.35 * dome + 0.1 * shoots);
  float height = 0.25 + 0.5 * smoothstep(0.45, 1.0, depth) + 0.9 * bigDome + 0.45 * smallDome + 0.08 * shoots;
  return Growth(cover, color, cover * height);
}

// Soot and runoff: dark streaks where rain ran down from the top, and sooty patches.
float sootAt(vec2 p) {
  if (u_soot <= 0.0) return 0.0;
  // Each streak runs its own distance down from the top, and only some columns have one.
  float column = 0.5 + 0.5 * fbm(vec2(p.x / 9.0, 0.0) + u_damageSeed, 3);
  float reach = u_sizeMm.y * (0.15 + 0.7 * column);
  float fromTop = 1.0 - smoothstep(0.3 * reach, reach, p.y);
  float streaks = smoothstep(0.5, 0.9, 0.5 + 0.5 * fbm(vec2(p.x / 5.0, p.y / 110.0) + u_damageSeed, 4));
  streaks *= smoothstep(0.35, 0.7, column);
  float patches = smoothstep(0.4, 0.9, 0.5 + 0.5 * fbm(p / 45.0 + u_damageSeed * 1.7, 3));
  return clamp(u_soot * (0.55 * streaks * fromTop + 0.45 * patches), 0.0, 0.8);
}

// Honeycomb weathering: a few clusters of rounded pits that merge into a honeycomb,
// mm deep.
float pitsAt(vec2 p) {
  if (u_pitting <= 0.0) return 0.0;
  float cluster = smoothstep(0.78 - 0.35 * u_pitting, 0.92 - 0.3 * u_pitting,
                             0.5 + 0.5 * fbm(p / 50.0 + u_damageSeed * 2.3, 3));
  if (cluster <= 0.0) return 0.0;
  vec3 cell = worley(p / 6.0 + u_damageSeed);
  float radius = 0.45 + 0.3 * cell.y;
  float pit = smoothstep(radius, 0.0, cell.x);
  return cluster * pit * pit * (1.2 + 1.6 * cell.z);
}

// Flaking: patches where the weathered surface layer has come away, leaving a fresher,
// lower surface behind a sharp edge. Returns 0..1 coverage of the loss.
float flakesAt(vec2 p) {
  if (u_flaking <= 0.0) return 0.0;
  // Broad patches with ragged edges where the layer broke away. The raggedness displaces
  // the pattern rather than adding to it, so it doesn't sprinkle tiny islands about.
  vec2 warp = 1.5 * vec2(snoise(p / 5.0 + u_damageSeed), snoise(p / 5.0 + u_damageSeed + 7.0));
  float n = 0.5 + 0.5 * fbm((p + warp) / 70.0 + u_damageSeed * 3.1, 2);
  float threshold = 1.0 - 0.5 * u_flaking;
  return smoothstep(threshold, threshold + 0.012, n);
}
