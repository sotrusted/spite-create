// Measured from the exact TTFs the app ships (and the backend renders with).
// Regenerate with PIL at size 1000: ascent from the font tables (below),
// inkDrop from the ink bottom of 'Te' drawn with anchor 'ls' minus the line
// gap, widthPerPt from ImageDraw.textlength('TYPE', font).
//
// ascent: (hhea.ascent + hhea.lineGap) / unitsPerEm - the distance from the
//   top of the text frame down to the baseline, per 1pt of font size. Taken
//   from the font tables rather than PIL's pixel-rounded metrics, and the
//   line gap matters: Times carries 0.0425 of it and nothing else does.
// inkDrop: how far the title's baseline-sitting glyphs (the T and e of
//   "Type" - not the y/p descenders, which should hang below the line) sit
//   below that metric baseline. Handwriting faces hang below it.
// widthPerPt: width of "TYPE" (the caps costume, the widest) per 1pt, used to pick
//   the largest size that still fits so autoshrink never silently fires and
//   invalidates the baseline arithmetic.

export const FONT_METRICS: Record<string, { ascent: number; inkDrop: number; widthPerPt: number }> = {
  ArialBlack: { ascent: 1.1006, inkDrop: 0.0124, widthPerPt: 2.944 },
  TimesNewRoman: { ascent: 0.9336, inkDrop: -0.0286, widthPerPt: 2.500 },
  TimesNewRomanBold: { ascent: 0.9336, inkDrop: -0.0286, widthPerPt: 2.667 },
  TimesNewRomanItalic: { ascent: 0.9336, inkDrop: -0.0306, widthPerPt: 2.334 },
  TimesNewRomanBoldItalic: { ascent: 0.9336, inkDrop: -0.0286, widthPerPt: 2.500 },
  Papyrus: { ascent: 0.9399, inkDrop: 0.0211, widthPerPt: 2.691 },
  Impact: { ascent: 1.0088, inkDrop: 0.0122, widthPerPt: 1.876 },
  CourierPrime: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 2.398 },
  CourierPrimeBold: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 2.398 },
  CourierPrimeItalic: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 2.398 },
  CourierPrimeBoldItalic: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 2.398 },
  Caveat: { ascent: 0.9600, inkDrop: 0.0450, widthPerPt: 1.933 },
  CaveatBold: { ascent: 0.9600, inkDrop: 0.0540, widthPerPt: 1.938 },
};

export const metricsFor = (fontFamily: string) =>
  FONT_METRICS[fontFamily] || { ascent: 1.0, inkDrop: 0, widthPerPt: 10 };

// Where the title's ink actually bottoms out, per 1pt of size. Aligning THIS
// is what reads as a shared baseline: Caveat's letters sit 0.061em below the
// metric baseline while Times sits 0.027em above it.
export const inkBaselineFor = (fontFamily: string) => {
  const m = metricsFor(fontFamily);
  return m.ascent + m.inkDrop;
};
