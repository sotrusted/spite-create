// Measured from the exact TTFs the app ships (and the backend renders with).
// Regenerate with PIL: ImageFont.truetype(path, 100).getmetrics() for ascent,
// and ImageDraw.textlength(TITLE, font) for the width ratio.
//
// ascent: (hhea.ascent + hhea.lineGap) / unitsPerEm - the distance from the
//   top of the text frame down to the baseline, per 1pt of font size. Taken
//   from the font tables rather than PIL's pixel-rounded metrics, and the
//   line gap matters: Times carries 0.0425 of it and nothing else does.
// inkDrop: how far the title's ink bottom sits below that metric baseline.
//   Glyphs do not all rest on the baseline - handwriting faces hang below it.
// widthPerPt: width of the masthead title per 1pt of font size, used to pick
//   the largest size that still fits so autoshrink never silently fires and
//   invalidates the baseline arithmetic.

export const FONT_METRICS: Record<string, { ascent: number; inkDrop: number; widthPerPt: number }> = {
  ArialBlack: { ascent: 1.1006, inkDrop: 0.0124, widthPerPt: 11.751 },
  TimesNewRoman: { ascent: 0.9336, inkDrop: -0.0266, widthPerPt: 8.733 },
  TimesNewRomanBold: { ascent: 0.9336, inkDrop: -0.0266, widthPerPt: 9.426 },
  TimesNewRomanItalic: { ascent: 0.9336, inkDrop: -0.0266, widthPerPt: 8.786 },
  TimesNewRomanBoldItalic: { ascent: 0.9336, inkDrop: -0.0266, widthPerPt: 9.056 },
  Papyrus: { ascent: 0.9399, inkDrop: 0.0221, widthPerPt: 9.436 },
  Impact: { ascent: 1.0088, inkDrop: 0.0172, widthPerPt: 8.789 },
  CourierPrime: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 12.592 },
  CourierPrimeBold: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 12.592 },
  CourierPrimeItalic: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 12.592 },
  CourierPrimeBoldItalic: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 12.592 },
  Caveat: { ascent: 0.9600, inkDrop: 0.0610, widthPerPt: 7.284 },
  CaveatBold: { ascent: 0.9600, inkDrop: 0.0710, widthPerPt: 7.415 },
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
