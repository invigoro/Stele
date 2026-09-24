// Letters burned into wood with a hot iron: dark charred strokes, slightly sunken,
// with a brown scorch that fades out just past their edges.

struct BurnedLetters {
  float charred; // 0..1
  float scorch;  // 0..1
  float depth;   // mm
};

BurnedLetters burnedLetters(vec2 p, float wear) {
  float px = 1.0 / u_pxPerMm;
  float d = textDistance(p);
  float charred = smoothstep(-0.5 * px, 0.8 * px + 0.02 * u_textSize, d);
  float scorch = smoothstep(-0.05 * u_textSize - 0.3, 0.0, d);
  float fade = 1.0 - 0.65 * clamp(wear, 0.0, 1.0);
  return BurnedLetters(charred * fade, scorch * fade, 0.15 * charred);
}
