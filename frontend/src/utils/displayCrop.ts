import { MIN_CARD_HEIGHT, CHROME, SPACE } from '../constants/space';

// The server stores top_y / bottom_y as a post's CONTENT extent - the tight
// band its text and stickers occupy. That is the right thing to cut when a
// post is quoted into someone else's canvas, so it deliberately carries no
// padding for chrome.
//
// A standalone card is a different surface: it overlays a quote button. So
// the card adjusts the crop here, at display time, where it cannot leak back
// into quoted strips. Two rules, both pure functions of the stored post and
// the screen width, so the same post always crops the same way:
//
// 1. Floor. A one-line post's content band is shorter than the chrome, so it
//    grows symmetrically (content stays optically centred) to MIN_CARD_HEIGHT.
// 2. Clearance. The [Aa] sits in the card's bottom-right corner. If content
//    reaches into the column it occupies, the bottom extends by exactly enough
//    for the button to sit a gutter below that content - never more, and not
//    at all when nothing is there.
//
// The canvas beyond the content is the post's own background, so extra band
// reads as the post's colour rather than as a letterbox.

export type DisplayCrop = { topY: number; bottomY: number };
export type ContentBox = [number, number, number, number]; // x0, y0, x1, y1 (canvas px)

export const displayCropBounds = (
  topY: number,
  bottomY: number,
  canvasWidth: number,
  canvasHeight: number,
  screenWidth: number,
  contentBoxes?: ContentBox[] | number[][] | null,
): DisplayCrop => {
  const k = canvasWidth / screenWidth; // canvas px per point
  let top = topY;
  let bottom = bottomY;

  const floor = Math.min(MIN_CARD_HEIGHT * k, canvasHeight);
  if (bottom - top < floor) {
    const centre = (top + bottom) / 2;
    top = Math.max(0, centre - floor / 2);
    bottom = Math.min(canvasHeight, top + floor);
    top = Math.max(0, bottom - floor);
  }

  if (contentBoxes && contentBoxes.length) {
    const right = canvasWidth - CHROME.inset * k;
    const left = right - CHROME.buttonWidth * k;
    const gutter = SPACE.sm * k;
    const inColumn = contentBoxes.filter(
      b => b[2] > left - gutter && b[0] < right + gutter && b[1] < bottom,
    );
    // Content running past the crop edge (a capped tall post) cannot be
    // cleared without breaking the cap; leave those cards as they are.
    const cutOff = inColumn.some(b => b[3] > bottom);
    if (inColumn.length && !cutOff) {
      const lowest = Math.max(...inColumn.map(b => b[3]));
      const needed = lowest + gutter + (CHROME.buttonHeight + CHROME.inset) * k;
      if (needed > bottom) bottom = Math.min(canvasHeight, needed);
    }
  }

  return { topY: top, bottomY: bottom };
};
