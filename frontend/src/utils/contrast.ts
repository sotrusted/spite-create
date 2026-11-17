// WCAG-style contrast helpers for keeping text readable against the canvas
// background as the user cycles colors.

export const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return [0, 0, 0];
  }
  return [0, 2, 4].map(i => parseInt(normalized.slice(i, i + 2), 16)) as [number, number, number];
};

const luminance = (rgb: [number, number, number]) => {
  const toLinear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

export const contrastRatio = (a: [number, number, number], b: [number, number, number]) => {
  const lumA = luminance(a);
  const lumB = luminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
};

// Next palette color (walking forward from the current one, to keep variety)
// that reads clearly against the background; falls back to the highest
// contrast available.
export const pickReadableColor = (background: string, palette: string[], current: string): string => {
  const bg = hexToRgb(background);
  const startIndex = Math.max(0, palette.indexOf(current));
  for (let i = 1; i <= palette.length; i++) {
    const candidate = palette[(startIndex + i) % palette.length];
    if (contrastRatio(bg, hexToRgb(candidate)) >= 4.5) {
      return candidate;
    }
  }
  return palette.reduce((best, candidate) =>
    contrastRatio(bg, hexToRgb(candidate)) > contrastRatio(bg, hexToRgb(best)) ? candidate : best,
  palette[0]);
};

// The dim laid over the canvas while a text is typed: black or white at
// `opacity`. It has to show (white over a white canvas is no dim at all -
// which is what dark ink used to get) and the ink has to read on it: of the
// two, the one that visibly changes the canvas, and where both do, the one
// the ink reads better on. background null (a gradient or an image, which
// vary under the text): whichever the ink contrasts with.
export const scrimColorFor = (background: string | null, ink: string, opacity: number): string => {
  const inkRgb = hexToRgb(ink);
  const valid = (hex: string | null): hex is string => !!hex && /^#[0-9a-f]{6}$/i.test(hex);
  if (!valid(background)) {
    return contrastRatio(inkRgb, [0, 0, 0]) >= contrastRatio(inkRgb, [255, 255, 255]) ? '#000000' : '#FFFFFF';
  }
  const bg = hexToRgb(background);
  const over = (scrim: number) =>
    bg.map(c => Math.round(c * (1 - opacity) + scrim * opacity)) as [number, number, number];
  const options = [{ color: '#000000', mixed: over(0) }, { color: '#FFFFFF', mixed: over(255) }]
    .map(o => ({ ...o, shows: contrastRatio(bg, o.mixed), reads: contrastRatio(inkRgb, o.mixed) }));
  const visible = options.filter(o => o.shows >= SCRIM_MIN_SHOW);
  const pool = visible.length ? visible : options;
  return pool.reduce((best, o) => (o.reads > best.reads ? o : best)).color;
};
// How much the dim must change the canvas to count as showing
const SCRIM_MIN_SHOW = 1.15;
