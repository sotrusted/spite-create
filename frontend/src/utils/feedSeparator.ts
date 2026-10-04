import { Colors, RAINBOW_MIN_DISTANCE } from '../constants/colors';
import { RULE_ON, RULE_BETWEEN } from '../constants/rules';
import { hexToRgb } from './contrast';

// A hairline between two feed posts whose touching edges are the same or
// nearly the same colour (e.g. yellow over highlighter), so the cards do not
// run together. Elsewhere the posts' own colours are the boundary. Its
// colour comes from the designed tables in constants/rules.

export interface SeparatorPolicy {
  // Edges closer than this (RGB distance) read as one colour: the same line
  // the palette is designed around (every pair sits at <= 87 or >= 106)
  similarDistance: number;
}

export const SEPARATOR: SeparatorPolicy = { similarDistance: RAINBOW_MIN_DISTANCE };

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

// A gradient stop may sit off the palette: it takes its nearest palette colour
export const nearestPaletteColor = (hex: string) =>
  Colors.postColors.reduce((best, c) => (distance(hex, c) < distance(hex, best) ? c : best));

// The line between `above` and `below`, or null for none
export function separatorColor(above: EdgePost, below: EdgePost, policy = SEPARATOR): string | null {
  const a = edgeColors(above);
  const b = edgeColors(below);
  if (!a || !b || distance(a.bottom, b.top) >= policy.similarDistance) return null;
  const [x, y] = [nearestPaletteColor(a.bottom), nearestPaletteColor(b.top)];
  if (x === y) return RULE_ON[x];
  const [first, second] = Colors.postColors.indexOf(x) < Colors.postColors.indexOf(y) ? [x, y] : [y, x];
  return RULE_BETWEEN[`${first}|${second}`] ?? RULE_ON[a.bottom.toUpperCase()] ?? RULE_ON[x];
}
