// Every gesture threshold in one place, named for what it protects against.
// Values are in points and milliseconds unless the name says otherwise.

export interface GesturePolicy {
  drag: {
    // The canvas pan (background/quote) activates only past this: a finger
    // never stays still, and activating on the first pixel of drift
    // swallowed the tap that places text
    canvasMinDistance: number;
    // A text element's own pan: small, so dragging text feels immediate
    elementMinDistance: number;
  };
  pinch: {
    // Spread change (fraction) before a pinch counts: resting or wobbling
    // fingers never nudge the size, and crossing it never jumps
    deadZone: number;
    // Text scale limits
    minScale: number;
    maxScale: number;
    // A text block smaller than this is pinched as if it were this big
    // (centred on it): two adult fingers do not fit on a short word
    minTargetWidth: number;
    minTargetHeight: number;
  };
  touch: {
    // A text element's tap/drag target is at least this big, however short
    // the text (the box the composer lays the element out in)
    minElementTarget: number;
  };
  tap: {
    // Second tap within this window is a double tap (quote); a single
    // tap's action waits it out
    doubleTapWindowMs: number;
  };
  zoom: {
    // Pinch-zoom limit on the post page
    maxScale: number;
  };
  longPress: {
    // Composer buttons: hold for the grid (fonts, colours, background)
    controlMs: number;
    // Feed card: hold to quote
    cardMs: number;
  };
}

export const GESTURES: GesturePolicy = {
  drag: { canvasMinDistance: 28, elementMinDistance: 4 },
  pinch: { deadZone: 0.06, minScale: 0.3, maxScale: 5, minTargetWidth: 180, minTargetHeight: 120 },
  touch: { minElementTarget: 120 },
  tap: { doubleTapWindowMs: 260 },
  zoom: { maxScale: 4 },
  longPress: { controlMs: 350, cardMs: 400 },
};
