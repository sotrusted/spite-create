import type { Point } from './hitTest';

// Zooming the post page about the point between the fingers. Content is laid
// out again at the new size (so text is real text at that size, not a
// magnified picture), and the scroll offset moves so the point under the
// fingers stays under them.

export const clampZoom = (zoom: number, max: number) => Math.min(max, Math.max(1, zoom));

// The scroll offset after going from `from` to `to` zoom, keeping the
// content under `focal` (viewport points) where it is. Never negative.
export function offsetAfterZoom(offset: Point, focal: Point, from: number, to: number): Point {
  const ratio = to / from;
  return {
    x: Math.max(0, (offset.x + focal.x) * ratio - focal.x),
    y: Math.max(0, (offset.y + focal.y) * ratio - focal.y),
  };
}
