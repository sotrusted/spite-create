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

// lineGap: the font's built-in line gap (hhea.lineGap / unitsPerEm), counted
//   into `ascent` above. A single line of text drawn by iOS puts its baseline
//   at ascent - lineGap below the top (utils/planLayout). Only Times has one.
// prose: the average advance per character, per 1pt, of a mixed-case
//   sentence ("The quick brown fox jumps over the lazy dog") - how wide the
//   face sets ordinary text, which caps-only TYPE misjudges for swash and
//   script faces. Used to keep a text's width when its font changes.
// space: the advance of a space, per 1pt. iOS counts the space a soft wrap
//   leaves at a line's end into that line's width; the server does not.
export const FONT_METRICS: Record<string, { ascent: number; inkDrop: number; widthPerPt: number; lineGap?: number; prose: number; space: number }> = {
  ArialBlack: { ascent: 1.1006, inkDrop: 0.0124, widthPerPt: 2.944, prose: 0.5662, space: 0.3335 },
  TimesNewRoman: { ascent: 0.9336, inkDrop: -0.0286, widthPerPt: 2.500, lineGap: 0.0425, prose: 0.4250, space: 0.2500 },
  TimesNewRomanBold: { ascent: 0.9336, inkDrop: -0.0286, widthPerPt: 2.667, lineGap: 0.0425, prose: 0.4488, space: 0.2500 },
  TimesNewRomanItalic: { ascent: 0.9336, inkDrop: -0.0306, widthPerPt: 2.334, lineGap: 0.0425, prose: 0.4164, space: 0.2500 },
  TimesNewRomanBoldItalic: { ascent: 0.9336, inkDrop: -0.0286, widthPerPt: 2.500, lineGap: 0.0425, prose: 0.4302, space: 0.2500 },
  Papyrus: { ascent: 0.9399, inkDrop: 0.0211, widthPerPt: 2.691, prose: 0.4563, space: 0.2270 },
  Impact: { ascent: 1.0088, inkDrop: 0.0122, widthPerPt: 1.876, prose: 0.4157, space: 0.1763 },
  CourierPrime: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 2.398, prose: 0.5996, space: 0.5996 },
  CourierPrimeBold: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 2.398, prose: 0.5996, space: 0.5996 },
  CourierPrimeItalic: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 2.398, prose: 0.5996, space: 0.5996 },
  CourierPrimeBoldItalic: { ascent: 0.7812, inkDrop: 0.0118, widthPerPt: 2.398, prose: 0.5996, space: 0.5996 },
  Caveat: { ascent: 0.9600, inkDrop: 0.0450, widthPerPt: 1.933, prose: 0.3410, space: 0.2420 },
  CaveatBold: { ascent: 0.9600, inkDrop: 0.0540, widthPerPt: 1.938, prose: 0.3456, space: 0.2420 },
  CabinSketch: { ascent: 0.8730, inkDrop: 0.0080, widthPerPt: 2.206, prose: 0.4559, space: 0.2250 },
  CabinSketchBold: { ascent: 0.8730, inkDrop: 0.0180, widthPerPt: 2.206, prose: 0.4559, space: 0.2250 },
  Cavalhatriz: { ascent: 0.7500, inkDrop: 0.0630, widthPerPt: 2.750, prose: 0.3895, space: 0.3125 },
  PrincessSofia: { ascent: 0.9863, inkDrop: 0.3180, widthPerPt: 2.828, prose: 0.3611, space: 0.2998 },
  PinyonScript: { ascent: 0.8633, inkDrop: 0.0030, widthPerPt: 2.294, prose: 0.3619, space: 0.2456 },
  Monocraft: { ascent: 0.8889, inkDrop: 0.0000, widthPerPt: 2.667, prose: 0.6667, space: 0.6667 },
  MonocraftBold: { ascent: 0.8889, inkDrop: 0.0230, widthPerPt: 2.667, prose: 0.6667, space: 0.6667 },
  Freeride: { ascent: 0.9400, inkDrop: 0.0000, widthPerPt: 2.019, prose: 0.3899, space: 0.1800 },
  FrederickaTheGreat: { ascent: 0.9775, inkDrop: 0.0160, widthPerPt: 2.771, prose: 0.4795, space: 0.3633 },
  PetitFormalScript: { ascent: 0.9927, inkDrop: 0.0200, widthPerPt: 3.063, prose: 0.5602, space: 0.3618 },
  LexendExaLight: { ascent: 1.0000, inkDrop: 0.0100, widthPerPt: 2.901, prose: 0.6159, space: 0.3620 },
  LexendExaSemiBold: { ascent: 1.0000, inkDrop: 0.0100, widthPerPt: 3.087, prose: 0.6545, space: 0.3890 },
  GrutchShaded: { ascent: 0.9230, inkDrop: 0.0850, widthPerPt: 2.726, prose: 0.5292, space: 0.3650 },
};

export const metricsFor = (fontFamily: string) =>
  FONT_METRICS[fontFamily] || { ascent: 1.0, inkDrop: 0, widthPerPt: 10, prose: 0.5, space: 0.25 };

// Top of a single-line Text to its baseline, per 1pt of size
export const baselineFromTop = (fontFamily: string) => {
  const m = metricsFor(fontFamily);
  return m.ascent - (m.lineGap ?? 0);
};

// Where the title's ink actually bottoms out, per 1pt of size. Aligning THIS
// is what reads as a shared baseline: Caveat's letters sit 0.061em below the
// metric baseline while Times sits 0.027em above it.
export const inkBaselineFor = (fontFamily: string) => {
  const m = metricsFor(fontFamily);
  return m.ascent + m.inkDrop;
};
