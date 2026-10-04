import { displayCropBounds, ContentBox, DisplayCrop } from './displayCrop';
import { gradientBandPx } from './gradient';
import type { Point } from './hitTest';

// How a post's full-canvas render is placed in the box that shows it.
//
// A post's top_y / bottom_y are its whole content extent (never cut). The
// feed shows that band in a card no taller than CARD.maxAspect x its width:
// a taller post is shrunk to fit, keeping its aspect, centred, with its own
// background around it - nothing is cropped away. The post page shows the
// whole band at full width, however tall (it scrolls and zooms).

export interface CardPolicy {
  // Feed card height limit, as height / width (5:4 portrait)
  maxAspect: number;
}

export const CARD: CardPolicy = { maxAspect: 1.25 };

// The fields of a post placement depends on
export interface PlacedPost {
  image_width?: number | null;
  image_height?: number | null;
  top_y?: number | null;
  bottom_y?: number | null;
  content_boxes?: ContentBox[] | number[][] | null;
}

export interface CardLayout {
  crop: DisplayCrop; // the canvas band shown, canvas px
  scale: number; // points per canvas px
  width: number; // the box, points
  height: number;
  // where the full-canvas image sits in the box, points (it overflows; the
  // box clips to the band)
  imageLeft: number;
  imageTop: number;
  imageWidth: number;
  imageHeight: number;
  shrunk: boolean; // narrower than the box: its sides show background
}

const placed = (post: PlacedPost) => {
  const canvasWidth = post.image_width || 0;
  const canvasHeight = post.image_height || 0;
  const { top_y: top, bottom_y: bottom } = post;
  if (!canvasWidth || !canvasHeight || typeof top !== 'number' || typeof bottom !== 'number' || bottom <= top) {
    return null;
  }
  return { canvasWidth, canvasHeight, top, bottom };
};

const layoutFor = (
  crop: DisplayCrop,
  canvasWidth: number,
  canvasHeight: number,
  boxWidth: number,
  maxHeight: number,
): CardLayout => {
  const band = crop.bottomY - crop.topY;
  const fullWidthScale = boxWidth / canvasWidth;
  const scale = Math.min(fullWidthScale, maxHeight / band);
  const imageWidth = canvasWidth * scale;
  return {
    crop,
    scale,
    width: boxWidth,
    height: band * scale,
    imageLeft: (boxWidth - imageWidth) / 2,
    imageTop: -crop.topY * scale,
    imageWidth,
    imageHeight: canvasHeight * scale,
    shrunk: scale < fullWidthScale - 1e-9,
  };
};

// A feed card: chrome-aware crop (displayCropBounds), at most CARD.maxAspect
export function feedCardLayout(post: PlacedPost, screenWidth: number): CardLayout | null {
  const p = placed(post);
  if (!p) return null;
  const crop = displayCropBounds(p.top, p.bottom, p.canvasWidth, p.canvasHeight, screenWidth, post.content_boxes);
  return layoutFor(crop, p.canvasWidth, p.canvasHeight, screenWidth, screenWidth * CARD.maxAspect);
}

// The post page: the whole content band, full width, no height limit
export function fullPostLayout(post: PlacedPost, width: number): CardLayout | null {
  const p = placed(post);
  if (!p) return null;
  return layoutFor({ topY: p.top, bottomY: p.bottom }, p.canvasWidth, p.canvasHeight, width, Infinity);
}

// A point in the box (points) -> the post's canvas (px)
export const canvasPointIn = (layout: CardLayout, point: Point): Point => ({
  x: (point.x - layout.imageLeft) / layout.scale,
  y: (point.y - layout.imageTop) / layout.scale,
});

// LinearGradient endpoints (unit coords of a view) that continue a gradient
// post's background beyond its image: the server fits the ramp to a band,
// from the band's top-left corner to its bottom-right, so map those canvas
// corners through the image's placement. viewTop is where the box sits in
// that view (points), for a view larger than the box.
export function gradientEndpoints(
  post: PlacedPost,
  layout: CardLayout,
  view: { width: number; height: number; top?: number },
) {
  const canvasWidth = post.image_width || 0;
  const band = gradientBandPx(post.top_y ?? 0, post.bottom_y ?? 0, post.image_height || 0);
  const top = view.top ?? 0;
  const toView = (x: number, y: number) => ({
    x: (layout.imageLeft + x * layout.scale) / view.width,
    y: (top + layout.imageTop + y * layout.scale) / view.height,
  });
  return { start: toView(0, band.top), end: toView(canvasWidth, band.bottom) };
}
