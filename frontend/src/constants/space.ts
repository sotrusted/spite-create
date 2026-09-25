// Pure design tokens: no react-native import, so layout maths stays testable
// under plain node and shared with anything that cannot boot the RN runtime.
// Everything below is in points.

// Spacing scale (4pt grid). Every margin, padding and gap in the app should
// be one of these; an off-scale number (14, 15, 18, 20, 28, 30) is a sign two
// surfaces drifted apart.
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const CHROME = {
  // THE gutter: distance from the screen (or a full-bleed post) edge to any
  // chrome sitting on it - masthead, FAB, [Aa], composer menus, detail
  // buttons, screen headers. One value so everything on the right edge
  // shares a column and everything on the left shares a margin.
  inset: SPACE.lg,
  // clears the status bar / island on full-bleed screens
  topInset: 60,
  // clears the home indicator for bottom-anchored actions (FAB, Post)
  bottomInset: 40,
  // square icon buttons on full-bleed screens (close, download, menu)
  iconButton: 44,
  iconSize: 24,
  // translucent backing that keeps a white icon legible on any post colour
  scrim: 'rgba(0,0,0,0.6)',
  // the quote button on cards and detail
  buttonWidth: 38,
  buttonHeight: 34,
  // grows the tap target past the drawn box without moving it
  hitSlop: SPACE.sm,
  hairline: '#88888A',
} as const;

// A card seats its chrome in a band at the bottom corner: the button, its edge
// inset, and a gutter before the text may start. A card's crop grows
// symmetrically around its content, so the band is reserved at both ends.
export const CHROME_BAND = CHROME.inset + CHROME.buttonHeight + SPACE.xl;
export const MIN_CARD_HEIGHT = CHROME_BAND * 2;
