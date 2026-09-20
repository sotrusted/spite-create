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
