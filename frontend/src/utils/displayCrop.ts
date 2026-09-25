import { MIN_CARD_HEIGHT } from '../constants/space';

// The server stores top_y / bottom_y as a post's CONTENT extent - the tight
// band its text and stickers occupy. That is the right thing to cut when a
// post is quoted into someone else's canvas, so it deliberately carries no
// padding for chrome.
//
// A standalone card is a different surface: it overlays a quote button, and a
// one-line post's content band is shorter than that button. So the card pads
// the crop out to the chrome floor here, at display time, where it cannot
// leak back into quoted strips. Expansion is symmetric so the content stays
// optically centred, then clamped to the canvas - which is already filled
// edge to edge with the post's background, so the extra band reads as the
// post's own colour rather than as a letterbox.

export type DisplayCrop = { topY: number; bottomY: number };

export const displayCropBounds = (
  topY: number,
  bottomY: number,
  canvasWidth: number,
  canvasHeight: number,
  screenWidth: number,
): DisplayCrop => {
  const floorPx = MIN_CARD_HEIGHT * (canvasWidth / screenWidth);
  const floor = Math.min(floorPx, canvasHeight);
  if (bottomY - topY >= floor) return { topY, bottomY };

  const centre = (topY + bottomY) / 2;
  let top = Math.max(0, centre - floor / 2);
  const bottom = Math.min(canvasHeight, top + floor);
  top = Math.max(0, bottom - floor);
  return { topY: top, bottomY: bottom };
};
