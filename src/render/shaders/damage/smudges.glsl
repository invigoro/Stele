// Smudges, read from the features texture
// (SMUDGE_ROW: x, y, radius, angle; +1: seed, strength, length).

struct Smudging {
  float amount; // 0..1 at this point
  vec2 drag;    // where the smeared ink came from, as an offset in mm
};

Smudging smudgesAt(vec2 p) {
  Smudging result = Smudging(0.0, vec2(0.0));
  for (int i = 0; i < MAX_FEATURES; i++) {
    if (i >= u_smudgeCount) break;
    vec4 smudge = texelFetch(u_features, ivec2(i, SMUDGE_ROW), 0);
    vec4 more = texelFetch(u_features, ivec2(i, SMUDGE_ROW + 1), 0);
    vec2 direction = vec2(cos(smudge.w), sin(smudge.w));
    vec2 q = p - smudge.xy;
    float along = dot(q, direction) / (smudge.z + more.z);
    float across = dot(q, vec2(-direction.y, direction.x)) / smudge.z;
    float shape = exp(-2.0 * (along * along + across * across));
    shape *= 0.7 + 0.3 * snoise(q / 2.5 + more.x); // a thumb isn't a perfect oval
    float amount = clamp(shape * more.y, 0.0, 1.0);
    if (amount > result.amount) {
      result.amount = amount;
      result.drag = -direction * more.z;
    }
  }
  return result;
}
