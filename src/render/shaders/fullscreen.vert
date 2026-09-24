#version 300 es
// One triangle that covers the whole viewport, built from gl_VertexID so no vertex
// buffer is needed. Draw it with gl.drawArrays(gl.TRIANGLES, 0, 3).

out vec2 v_uv;

void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
