/**
 * Math & Geometry Utility Library for Agility Course Designer
 */

export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

export function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

export function rotatePoint(p, center, angleDeg) {
  const rad = degToRad(angleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;

  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos)
  };
}

export function worldToLocal(p, center, angleDeg) {
  const rad = degToRad(-(angleDeg || 0));
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;

  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos
  };
}

export function normalizeAngle(angle) {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
}

/**
 * Calculates smooth quadratic/cubic Bezier curve points for tunnels or dog paths
 */
export function getQuadraticBezierPoint(p0, p1, p2, t) {
  const invT = 1 - t;
  return {
    x: invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x,
    y: invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y
  };
}

export function getCubicBezierPoint(p0, p1, p2, p3, t) {
  const invT = 1 - t;
  return {
    x: Math.pow(invT, 3) * p0.x + 3 * Math.pow(invT, 2) * t * p1.x + 3 * invT * Math.pow(t, 2) * p2.x + Math.pow(t, 3) * p3.x,
    y: Math.pow(invT, 3) * p0.y + 3 * Math.pow(invT, 2) * t * p1.y + 3 * invT * Math.pow(t, 2) * p2.y + Math.pow(t, 3) * p3.y
  };
}

/**
 * Check if point (px, py) lies inside oriented rectangle centered at (cx, cy)
 */
export function isPointInOrientedRect(px, py, cx, cy, width, height, angleDeg) {
  // Rotate point back into unrotated coordinate space around (cx, cy)
  const unrotated = rotatePoint({ x: px, y: py }, { x: cx, y: cy }, -angleDeg);
  const halfW = width / 2;
  const halfH = height / 2;

  return (
    unrotated.x >= cx - halfW &&
    unrotated.x <= cx + halfW &&
    unrotated.y >= cy - halfH &&
    unrotated.y <= cy + halfH
  );
}

/**
 * Format length values cleanly (e.g. 5.2m or 17.1ft)
 */
export function formatDistance(valInMeters, unit = 'm') {
  if (unit === 'ft') {
    const feet = valInMeters * 3.28084;
    return `${feet.toFixed(1)} ft`;
  }
  return `${valInMeters.toFixed(1)} m`;
}
