// Object outlines (see media/shapes.ts). u_shapeParams: x = width of each tabula
// handle, y = width of the tabula's moulded frame, z = radius of the stele's arch.

const int SHAPE_RECTANGLE = 0;
const int SHAPE_STELE = 1;
const int SHAPE_TABULA = 2;
const int SHAPE_FRAGMENT = 3;
const int SHAPE_SHEET = 4;
const int SHAPE_TORN = 5;

// Isosceles trapezoid centred on the origin: half-width r1 at y = -he, r2 at y = +he
// (after Inigo Quilez). Negative inside.
float sdTrapezoid(vec2 p, float r1, float r2, float he) {
  vec2 k1 = vec2(r2, he);
  vec2 k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

// Signed distance to the tabula's central panel (without its handles). Negative inside.
float tabulaPanel(vec2 p, float cornerRadius) {
  vec2 halfSize = 0.5 * u_sizeMm;
  return sdRoundedBox(p - halfSize, vec2(halfSize.x - u_shapeParams.x, halfSize.y), cornerRadius);
}

// Signed distance to the object's outline, in mm: negative inside.
float outlineDistance(vec2 p, float cornerRadius) {
  vec2 halfSize = 0.5 * u_sizeMm;
  if (u_shape == SHAPE_STELE) {
    float radius = u_shapeParams.z;
    float body = sdRoundedBox(p - vec2(halfSize.x, 0.5 * (radius + u_sizeMm.y)), vec2(halfSize.x, 0.5 * (u_sizeMm.y - radius)), cornerRadius);
    float arch = length(p - vec2(halfSize.x, radius)) - radius;
    return min(body, arch);
  }
  if (u_shape == SHAPE_TABULA) {
    float handle = u_shapeParams.x;
    float panel = tabulaPanel(p, cornerRadius);
    // Dovetail handles: narrow where they join the panel, flaring toward their ends,
    // each pierced by a nail hole.
    float along = abs(p.x - halfSize.x) - (halfSize.x - handle); // 0 at the join, `handle` at the end
    float dovetail = sdTrapezoid(vec2(p.y - halfSize.y, along - 0.5 * handle), 0.12 * u_sizeMm.y, 0.42 * u_sizeMm.y, 0.5 * handle);
    float nail = length(vec2(along - 0.55 * handle, p.y - halfSize.y)) - 1.8;
    return max(min(panel, dovetail), -nail);
  }
  return sdRoundedBox(p - halfSize, halfSize, cornerRadius);
}

// Extra height of mouldings, mm: the tabula's raised frame around a sunken field.
float mouldingHeight(vec2 p, float cornerRadius) {
  if (u_shape != SHAPE_TABULA) return 0.0;
  float frame = u_shapeParams.y;
  float inside = -tabulaPanel(p, cornerRadius); // distance in from the panel's edge
  if (inside < 0.0) return 0.0;
  float t = inside / frame;
  // A flat band, then a rounded bead, then a hollow curve down into the field.
  float bead = 0.9 * sin(3.14159 * clamp((t - 0.3) / 0.4, 0.0, 1.0));
  float field = -1.6 * smoothstep(0.7, 1.0, t);
  return bead + field;
}
