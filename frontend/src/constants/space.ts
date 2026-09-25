// Pure design tokens: no react-native import, so layout maths stays testable
// under plain node and shared with anything that cannot boot the RN runtime.
// Everything below is in points.

// Spacing scale (4pt grid). Overlay chrome and card edges derive from this
// instead of each surface inventing its own 18 / 20 / 14.
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const CHROME = {
  // square-ish tap target used by the quote button on cards and detail
  buttonWidth: 38,
  buttonHeight: 34,
  // distance from the edge of a card or a full-bleed screen
  inset: SPACE.md,
  // clears the status bar on full-bleed screens
  topInset: 60,
  // grows the tap target past the drawn box without moving it
  hitSlop: SPACE.sm,
  hairline: '#88888A',
} as const;

// A card seats its chrome in a band at the bottom corner: the button, its edge
// inset, and a gutter before the text may start. A card's crop grows
// symmetrically around its content, so the band is reserved at both ends.
export const CHROME_BAND = CHROME.inset + CHROME.buttonHeight + SPACE.xl;
export const MIN_CARD_HEIGHT = CHROME_BAND * 2;
