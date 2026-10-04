import type { Point } from './hitTest';

// Zooming the post page. The page's content is laid out as one uniform
// scaling of its zoom-1 layout (box, margins and all), so a committed zoom
// is exactly the live pinch transform made permanent: during a pinch the
// content is scaled by s about `origin` (a content point, fixed when the
// pinch began); on release it is laid out again at zoom x s and scrolled so
// every point is where the transform had put it. No jump on release.

export const clampZoom = (zoom: number, max: number) => Math.min(max, Math.max(1, zoom));

// The live pinch factor allowed from `zoom` (the result stays in [1, max])
export const clampPinch = (scale: number, zoom: number, max: number) => clampZoom(zoom * scale, max) / zoom;

// The scroll offset that makes the committed layout show what the transform
// showed: content point p was drawn at origin + (p - origin)s - offset, and
// is now at p*s - offset'. Never negative.
export function offsetAfterPinch(offset: Point, origin: Point, scale: number): Point {
  return {
    x: Math.max(0, offset.x + origin.x * (scale - 1)),
    y: Math.max(0, offset.y + origin.y * (scale - 1)),
  };
}
