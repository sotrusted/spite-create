// Rules: the hairline drawn between two feed posts that would otherwise run
// together. Like a printer's rule between pages, its colour is chosen for
// the page colour it sits on, from the post palette - never a generic
// black or white.
//
// RULE_ON: each palette colour's companion - the palette colour a fine line
// reads best in on that background, chosen to belong with it (cream and
// oxblood, the yellows and link blue, violet and baby pink).
// RULE_BETWEEN: the palette's near-twins (within the palette's 'same colour'
// distance) - one line colour that sits right on both. Keyed by the two
// colours in palette order, joined with '|'.
//
// Both tables are checked by tests: every palette colour has a companion,
// every near-twin pair has an entry, and every value is a palette colour.

export const RULE_ON: Record<string, string> = {
  '#F8F8FF': '#B7BEC7', // Ghost White    / Cool Gray
  '#FAEBD7': '#690016', // Antique White  / Oxblood
  '#B7BEC7': '#3D3D42', // Cool Gray      / Graphite
  '#3D3D42': '#B7BEC7', // Graphite       / Cool Gray
  '#000000': '#B7BEC7', // Black          / Cool Gray
  '#690016': '#FAEBD7', // Oxblood        / Antique White
  '#FF1A1A': '#690016', // Bright Red     / Oxblood
  '#FF940A': '#690016', // Bright Orange  / Oxblood
  '#F0FF00': '#0000EE', // Bright Yellow  / Link Blue
  '#F9FF4F': '#0000EE', // Lemon          / Link Blue
  '#CCFF00': '#0000EE', // Highlighter    / Link Blue
  '#32CD32': '#3D3D42', // Lime Green     / Graphite
  '#00CED1': '#0000EE', // Dark Turquoise / Link Blue
  '#0000EE': '#00CED1', // Link Blue      / Dark Turquoise
  '#2749F5': '#00CED1', // Royal Blue     / Dark Turquoise
  '#AB00FF': '#FF90C2', // Electric Violet/ Baby Pink
  '#9932CC': '#FF90C2', // Dark Orchid    / Baby Pink
  '#FF1493': '#FF90C2', // Deep Pink      / Baby Pink
  '#FF90C2': '#FF1493', // Baby Pink      / Deep Pink
};

export const RULE_BETWEEN: Record<string, string> = {
  '#F8F8FF|#FAEBD7': '#690016', // the whites: oxblood
  '#FAEBD7|#B7BEC7': '#3D3D42', // cream and cool gray: graphite
  '#B7BEC7|#FF90C2': '#3D3D42', // cool gray and baby pink: graphite
  '#3D3D42|#690016': '#B7BEC7', // graphite and oxblood: cool gray
  '#F0FF00|#F9FF4F': '#0000EE', // yellow and lemon: link blue
  '#F0FF00|#CCFF00': '#0000EE', // yellow and highlighter: link blue
  '#0000EE|#2749F5': '#00CED1', // the blues: turquoise
  '#AB00FF|#9932CC': '#FF90C2', // the violets: baby pink
};
