// The post page zooms with iOS's own scroll-view zoom (nothing re-laid out,
// so nothing jumps). Text is then redrawn sharp for the settled zoom: at a
// whole-number resolution, the smallest that covers it, up to the maximum.
export const textResolutionFor = (zoomScale: number, max: number) =>
  Math.min(max, Math.max(1, Math.ceil(zoomScale - 0.05)));
