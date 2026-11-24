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

// --- drag: which text element ---

// A text as drawn (scale applied): its centre and half its size, points
export interface TouchBox { id: string; x: number; y: number; halfWidth: number; halfHeight: number }

// The text a finger coming down at `point` takes hold of (null: none).
// Each text is a target at least minTarget in size, centred on it, so a
// short word can be grabbed; where targets overlap, the text whose drawn
// box is nearest the finger wins, then the smaller one, then the one on
// top (later in the list). A big text's target is only its own drawn box:
// it does not reach out and take a touch meant for a text beside it.
// (Runs on the UI thread: plain loops, no closures.)
export function pickTouchTarget(boxes: TouchBox[], point: Point, minTarget: number): string | null {
  'worklet';
  let best: string | null = null;
  let bestDistance = 0;
  let bestArea = 0;
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    const offX = Math.abs(point.x - box.x);
    const offY = Math.abs(point.y - box.y);
    if (offX > Math.max(box.halfWidth, minTarget / 2) || offY > Math.max(box.halfHeight, minTarget / 2)) continue;
    const distance = Math.hypot(Math.max(0, offX - box.halfWidth), Math.max(0, offY - box.halfHeight));
    const area = box.halfWidth * box.halfHeight;
    if (best === null || distance < bestDistance || (distance === bestDistance && area < bestArea)) {
      best = box.id;
      bestDistance = distance;
      bestArea = area;
    }
  }
  return best;
}

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
  return quotedLevelAt(chain, canvasPoint)?.post_id ?? null;
}

// The same, as the level itself (its strip is what a press flashes)
export function quotedLevelAt<L extends QuoteLevel>(chain: L[], canvasPoint: Point): L | null {
  let hit: L | null = null;
  for (const level of chain) {
    if (level.hidden || !level.post_id || !contains(level.rect, canvasPoint)) break;
    hit = level;
  }
  return hit;
}
