// Burns, read from the features texture (BURN_ROW: x, y, radius, strength; +1: seed).

struct Burning {
  float missing; // 1 where it burned right through
  float charred; // 0..1, black charring
  float scorch;  // 0..1, brown scorching around the char
};

Burning burnsAt(vec2 p) {
  Burning result = Burning(0.0, 0.0, 0.0);
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_burnCount) break;
    vec4 burn = texelFetch(u_features, ivec2(i, BURN_ROW), 0);
    float seed = texelFetch(u_features, ivec2(i, BURN_ROW + 1), 0).x;
    vec2 q = p - burn.xy;
    float r = length(q);
    if (r > burn.z * 1.6 + 14.0) continue;
    float front = burn.z * (1.0 + 0.35 * fbm(q / burn.z * 1.4 + seed, 5));
    float inside = front - r; // mm inside the burn front
    float strength = burn.w;
    // Strong burns go right through; around that the edge is charred black, and
    // beyond it the surface is scorched brown.
    float through = strength > 0.55 ? clamp((inside - 2.0) * u_pxPerMm + 0.5, 0.0, 1.0) : 0.0;
    result.missing = max(result.missing, through);
    result.charred = max(result.charred, smoothstep(-1.0, 1.5, inside) * strength);
    result.scorch = max(result.scorch, smoothstep(-12.0 * strength - 2.0, 0.0, inside) * strength);
  }
  return result;
}
