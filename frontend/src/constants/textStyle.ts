import { RAINBOW_MIN_DISTANCE } from './colors';

// Text outline (the Impact meme border), as a typed policy. The outline a
// post draws is resolved on the client (utils/outline) and sent as a plain
// colour; both sides stroke it OUTLINE.widthEm x the font size wide.

// What an element asks for. 'auto' follows the text colour (and the
// background); 'custom' is a colour the user picked, until the text colour
// next changes - then it goes back to following.
export type OutlineSetting =
  | { mode: 'off' }
  | { mode: 'auto' }
  | { mode: 'custom'; color: string };

export interface OutlinePolicy {
  widthEm: number; // stroke width per 1 of font size (shared/style.json)
  // 'auto' picks the first candidate that reads against the text and is not
  // lost in a solid background: black or white first (whichever contrasts
  // more with the text - the same rule as text on a background), then the
  // other, then the palette by contrast with the text
  minTextContrast: number; // WCAG contrast ratio, outline vs text
  minBackgroundDistance: number; // RGB distance, outline vs solid background
}

export const OUTLINE: OutlinePolicy = {
  widthEm: 0.07,
  minTextContrast: 3,
  // the same "these two colours read as different" line the rainbow uses
  minBackgroundDistance: RAINBOW_MIN_DISTANCE,
};

// Per-font starting style: a font that comes with its own look (Impact:
// capitals with a border) sets it when chosen, and an element only keeps
// what the user changed from that look (utils/outline.applyFontChange)
export interface FontStyleDefaults {
  capsLock: boolean;
  outline: 'off' | 'auto';
}

export const PLAIN_STYLE: FontStyleDefaults = { capsLock: false, outline: 'off' };
