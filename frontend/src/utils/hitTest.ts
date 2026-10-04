// Which thing a touch means, as pure functions of typed geometry.

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

const contains = (r: Rect, p: Point) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

// Distance from a point to a rect's edge (0 inside)
const distanceTo = (r: Rect, p: Point) => {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
};

// A rect grown, about its centre, to at least the given size
export const atLeast = (r: Rect, minWidth: number, minHeight: number): Rect => {
  const width = Math.max(r.width, minWidth);
  const height = Math.max(r.height, minHeight);
  return { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height };
};

// --- pinch: which text element ---

export interface PinchCandidate {
  id: string;
  box: Rect; // the text block as drawn (scale applied), screen points
}

export interface PinchTargeting {
  minTargetWidth: number;
  minTargetHeight: number;
}

// The element a pinch centred at `focal` resizes:
// - each element is a target at least minTarget in size, so a short word can
//   be pinched without both fingers landing on it; big elements are their
//   own size;
// - where enlarged targets overlap (several small elements close together),
//   the element whose real box is nearest the focal point wins, then the
//   smaller one - a pinch on top of a big block over a small word inside it
//   means the small word;
// - a pinch on no target falls back to the selected element (null if none).
export function pickPinchTarget(
  candidates: PinchCandidate[],
  focal: Point,
  selectedId: string | null,
  policy: PinchTargeting,
): string | null {
  const hits = candidates
    .filter(c => contains(atLeast(c.box, policy.minTargetWidth, policy.minTargetHeight), focal))
    .sort((a, b) =>
      distanceTo(a.box, focal) - distanceTo(b.box, focal)
      || a.box.width * a.box.height - b.box.width * b.box.height);
  if (hits.length) return hits[0].id;
  return candidates.some(c => c.id === selectedId) ? selectedId : null;
}

// --- tap: which post in a quote chain ---

export interface QuoteLevel {
  post_id?: string;
  rect: Rect; // in the root post's canvas px
  hidden: boolean;
}

// The post a tap at `canvasPoint` (root canvas px) means: the deepest quoted
// level whose strip contains it, or null for the root post itself. A hidden
// (blocked) level, and everything inside it, belongs to the level around it.
export function quotedPostAt(chain: QuoteLevel[], canvasPoint: Point): string | null {
  let hit: string | null = null;
  for (const level of chain) {
    if (level.hidden || !level.post_id || !contains(level.rect, canvasPoint)) break;
    hit = level.post_id;
  }
  return hit;
}
