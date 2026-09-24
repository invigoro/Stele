#version 300 es
// Draws the finished image onto the page's canvas over a backdrop colour. The image's
// first row is its top, but the canvas counts rows from the bottom, hence the flip.
precision highp float;

uniform sampler2D u_image;
uniform vec4 u_viewport; // x, y, width, height of the image on the canvas, in pixels
uniform vec3 u_backdrop; // sRGB colour behind transparent parts

out vec4 outColor;

void main() {
  vec2 uv = (gl_FragCoord.xy - u_viewport.xy) / u_viewport.zw;
  vec4 image = texture(u_image, vec2(uv.x, 1.0 - uv.y));
  outColor = vec4(mix(u_backdrop, image.rgb, image.a), 1.0);
}
