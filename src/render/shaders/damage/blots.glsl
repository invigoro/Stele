// Ink blots, read from the features texture (BLOT_ROW: x, y, rx, ry; +1: seed, round,
// spatter, angle): a pool of ink with droplets thrown out around it. Blots dropped from
// the pen are round and splash out in points; blots over words marked [[like this]] are
// squarish, to cover the word.

// Ink coverage from blots at p, 0..1.
float blotsAt(vec2 p) {
  float ink = 0.0;
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_blotCount) break;
    vec4 blot = texelFetch(u_features, ivec2(i, BLOT_ROW), 0);
    vec4 more = texelFetch(u_features, ivec2(i, BLOT_ROW + 1), 0);
    float seed = more.x;
    float roundness = more.y;
    float spatter = more.z;
    vec2 d = p - blot.xy;
    float c = cos(more.w);
    float s = sin(more.w);
    vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y) / blot.zw;
    // Round, or a rounded rectangle (superellipse) that covers the corners of a word.
    vec2 q2 = q * q;
    float r = mix(sqrt(sqrt(q2.x * q2.x + q2.y * q2.y)), length(q), roundness);
    float reach = 1.45 + 1.1 * spatter; // the furthest droplet (see blotReach in sheetDamage.ts)
    if (r > reach) continue;
    float scale = min(blot.z, blot.w); // mm per unit of q, roughly
    // Lobed edges; a dropped blot also splashes out in a few points.
    vec2 around = q / max(length(q), 0.001);
    float splash = roundness * spatter * 0.4 * pow(smoothstep(0.2, 0.8, snoise(around * 3.2 + seed * 1.7)), 2.0);
    float edge = (1.1 + 0.15 * fbm(q * 1.4 + seed, 3) + splash - r) * scale;
    edge += 0.08 * snoise(p / 0.3 + seed) * detail(0.3); // the ink bleeds a little into the fibres
    float body = clamp(edge * u_pxPerMm + 0.5, 0.0, 1.0);
    // A few droplets thrown out around it, smaller further away, and from a dropped blot
    // mostly on the side it splashed toward (+x before turning by its angle).
    vec3 drop = worley(q * 4.0 + seed);
    float chance = 0.55 * spatter * mix(1.0, 0.6 + 0.4 * around.x, roundness);
    float size = 0.3 * drop.y * (1.0 + 1.5 * step(0.92, drop.y)) * step(1.0 - chance, drop.z)
               * (1.0 - smoothstep(1.0, reach, r));
    float droplet = clamp((size - drop.x) / 4.0 * scale * u_pxPerMm + 0.5, 0.0, 1.0) * step(0.01, size);
    ink = max(ink, max(body, droplet));
  }
  return ink;
}
