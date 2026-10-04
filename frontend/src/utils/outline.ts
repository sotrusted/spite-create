import { Colors, FontChoices } from '../constants/colors';
import { OUTLINE, OutlinePolicy, OutlineSetting, FontStyleDefaults, PLAIN_STYLE } from '../constants/textStyle';
import { contrastRatio, hexToRgb } from './contrast';
import type { FontChoice } from '../types';

const BLACK = '#000000';
const WHITE = '#F8F8FF'; // the palette's white

const rgbDistance = (a: string, b: string) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

// The colour 'auto' draws. background: the post's solid colour, or null on
// a gradient or image (which vary under the text, so only the text counts).
export function autoOutlineColor(
  textColor: string,
  background: string | null,
  policy: OutlinePolicy = OUTLINE,
): string {
  const text = hexToRgb(textColor);
  const vsText = (c: string) => contrastRatio(text, hexToRgb(c));
  const [first, second] = vsText(BLACK) >= vsText(WHITE) ? [BLACK, WHITE] : [WHITE, BLACK];
  const palette = [...Colors.postColors]
    .filter(c => c !== BLACK && c !== WHITE)
    .sort((a, b) => vsText(b) - vsText(a));
  const fits = (c: string) =>
    vsText(c) >= policy.minTextContrast
    && (background === null || rgbDistance(c, background) >= policy.minBackgroundDistance);
  return [first, second, ...palette].find(fits) ?? first;
}

// The colour an element's outline draws with, or null for none
export function resolveOutlineColor(
  setting: OutlineSetting | undefined,
  textColor: string,
  background: string | null,
): string | null {
  if (!setting || setting.mode === 'off') return null;
  if (setting.mode === 'custom') return setting.color;
  return autoOutlineColor(textColor, background);
}

export const fontStyleDefaults = (family: FontChoice): FontStyleDefaults =>
  (FontChoices[family] as { style?: FontStyleDefaults }).style ?? PLAIN_STYLE;

type Styled = { fontFamily: FontChoice; capsLock: boolean; outline?: OutlineSetting };

// Switching font: each of the font's own style choices (caps, border) moves
// to the new font's default - unless the user had changed it from the old
// font's default, which then stays as they set it
export function applyFontChange(el: Styled, next: FontChoice): Pick<Styled, 'fontFamily' | 'capsLock' | 'outline'> {
  const was = fontStyleDefaults(el.fontFamily);
  const now = fontStyleDefaults(next);
  const outlineMode = el.outline?.mode ?? 'off';
  return {
    fontFamily: next,
    capsLock: el.capsLock === was.capsLock ? now.capsLock : el.capsLock,
    outline: outlineMode === was.outline ? { mode: now.outline } : el.outline ?? { mode: 'off' },
  };
}

// A new element in a font starts with that font's look
export const startingStyle = (family: FontChoice) => {
  const d = fontStyleDefaults(family);
  return { capsLock: d.capsLock, outline: { mode: d.outline } as OutlineSetting };
};

// Changing the text colour: a picked border goes back to following it, so
// the border always contrasts with the new colour
export const outlineAfterTextColor = (setting: OutlineSetting | undefined): OutlineSetting | undefined =>
  setting?.mode === 'custom' ? { mode: 'auto' } : setting;

