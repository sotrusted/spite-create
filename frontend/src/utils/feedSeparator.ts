import { RAINBOW_MIN_DISTANCE } from '../constants/colors';
import { contrastRatio, hexToRgb } from './contrast';

// A hairline between two feed posts whose meeting edges are the same or
// nearly the same colour (e.g. yellow over highlighter green), so the cards
// do not run together. Elsewhere the posts' own colours are the boundary.

export interface SeparatorPolicy {
  // Edges closer than this (RGB distance) read as one colour: the same line
  // the palette is designed around (every pair sits at <= 74 or >= 106)
  similarDistance: number;
  width: number; // points
}

export const SEPARATOR: SeparatorPolicy = { similarDistance: RAINBOW_MIN_DISTANCE, width: 1 };

// What a post's top and bottom edges look like. A gradient runs diagonally
// from its first stop to its last; an image post has no single colour.
export interface EdgePost {
  background_color?: string | null;
  background_gradient?: string[] | null;
  background_image?: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function edgeColors(post: EdgePost): { top: string; bottom: string } | null {
  if (post.background_image) return null;
  const stops = post.background_gradient;
  if (stops && stops.length > 1) {
    const [top, bottom] = [stops[0], stops[stops.length - 1]];
    return HEX.test(top) && HEX.test(bottom) ? { top, bottom } : null;
  }
  const solid = post.background_color;
  return solid && HEX.test(solid) ? { top: solid, bottom: solid } : null;
}

const distance = (a: string, b: string) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

// The line between `above` and `below`, or null for none. Black or white,
// whichever stands out more against the weaker of the two edges.
export function separatorColor(above: EdgePost, below: EdgePost, policy = SEPARATOR): string | null {
  const a = edgeColors(above);
  const b = edgeColors(below);
  if (!a || !b || distance(a.bottom, b.top) >= policy.similarDistance) return null;
  const against = (line: string) =>
    Math.min(contrastRatio(hexToRgb(line), hexToRgb(a.bottom)), contrastRatio(hexToRgb(line), hexToRgb(b.top)));
  return against('#000000') >= against('#FFFFFF') ? '#000000' : '#FFFFFF';
}
