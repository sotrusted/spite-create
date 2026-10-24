import { Colors } from '../constants/colors';
import { RULE_ON } from '../constants/rules';
import { hexToRgb } from './contrast';

// A hairline between two feed posts whose touching edges are the same
// colour, so the cards do not run together. Elsewhere, near-twins included
// (graphite over oxblood), the posts' own colours are the boundary. Its
// colour is the palette companion in constants/rules.

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
export function separatorColor(above: EdgePost, below: EdgePost): string | null {
  const a = edgeColors(above);
  const b = edgeColors(below);
  if (!a || !b) return null;
  const color = nearestPaletteColor(a.bottom);
  return color === nearestPaletteColor(b.top) ? RULE_ON[color] : null;
}
