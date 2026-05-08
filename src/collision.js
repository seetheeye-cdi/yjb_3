// AABB (Axis-Aligned Bounding Box) collision helpers.
// Boxes use the shape: { x, y, w, h } with x,y at top-left.

export function aabb(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// Shrinks a box by symmetric padding so collisions feel fair.
export function pad(box, px, py) {
  return {
    x: box.x + px,
    y: box.y + py,
    w: Math.max(0, box.w - px * 2),
    h: Math.max(0, box.h - py * 2),
  };
}
