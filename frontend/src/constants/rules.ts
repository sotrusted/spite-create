// Rules: the hairline drawn between two feed posts that would otherwise run
// together. Like a printer's rule between pages, its colour is chosen for
// the page colour it sits on, from the post palette - never a generic
// black or white.
//
// RULE_ON: each palette colour's companion - the palette colour a fine line
// reads best in on that background, chosen to belong with it (cream and
// oxblood, the yellows and link blue, violet and baby pink).
// Checked by tests: every palette colour has a companion, itself a palette
// colour.

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

