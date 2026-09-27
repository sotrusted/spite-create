// Background gradients are fitted to a band around the post's crop, not the
// whole canvas, so even a one-line post shows the whole ramp. The band is the
// content crop (top_y..bottom_y, canvas px) grown to at least
// GRADIENT_MIN_BAND_PX. Mirrors Post._gradient_band_for / GRADIENT_MIN_BAND on
// the server; the composer and the detail screen both use this.
export const GRADIENT_MIN_BAND_PX = 500;

export const gradientBandPx = (topY: number, bottomY: number, canvasHeight: number) => {
  const need = Math.min(GRADIENT_MIN_BAND_PX, canvasHeight);
  if (bottomY - topY >= need) return { top: topY, bottom: bottomY };
  const centre = (topY + bottomY) / 2;
  let top = Math.max(0, centre - need / 2);
  const bottom = Math.min(canvasHeight, top + need);
  top = Math.max(0, bottom - need);
  return { top, bottom };
};
