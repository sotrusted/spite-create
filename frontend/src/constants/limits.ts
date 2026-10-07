// Limits the API enforces on a post; the composer stays inside them. They
// match shared/limits.json, as does the backend's posts/limits.py (a test on
// each side compares them with it).
export const LIMITS = {
  canvasWidth: 1080,
  canvasHeightMin: 1080,
  canvasHeightMax: 4000,
  fontSizeMin: 4, // canvas px
  fontSizeMax: 2000,
  maxTextElements: 30,
  maxPostLength: 500, // all elements' text together
  gradientStopsMin: 2,
  gradientStopsMax: 8,
  maxColorRuns: 200,
  quoteChainDepth: 64, // quoted levels the post page draws text for
} as const;
