import { CanvasState, CanvasTextElement, CanvasRect, CANVAS_STATE_VERSION } from '../types/canvas';
import { ComposerSnapshot } from './buildPostPayload';

// Capture: the snapshot the composer builds its payload from, with the full
// editor elements (ids, drag origins) instead of the payload subset.
export const toCanvasState = (
  s: Omit<ComposerSnapshot, 'textElements'> & { textElements: CanvasTextElement[] },
): CanvasState => ({
  version: CANVAS_STATE_VERSION,
  screenWidth: s.screenWidth,
  screenHeight: s.screenHeight,
  textElements: s.textElements.map(el => ({ ...el })),
  stickerElements: s.stickerElements.map(st => ({ ...st })),
  backgroundColor: s.backgroundColor,
  backgroundGradient: [...s.backgroundGradient],
  backgroundImage: s.backgroundImage,
  imageBackgroundScale: s.imageBackgroundScale,
  imageBackgroundPosition: { ...s.imageBackgroundPosition },
  imageCoverScale: s.imageCoverScale,
  cropTop: s.cropTop,
  cropBottom: s.cropBottom,
  isSigned: s.isSigned,
  ...(s.signatureStyle ? { signatureStyle: s.signatureStyle } : {}),
  repost: s.repostData
    ? { originalPostId: s.repostData.originalPost.id, stripRect: s.repostStripRect ? { ...s.repostStripRect } : null }
    : null,
});

// Restore onto this screen. On the device that composed it this is the
// identity - the exact state comes back. On a different width everything
// that lives in screen points (positions, sizes, spacing) scales by the width
// ratio, which keeps the post's canvas-pixel layout - what the server renders
// - unchanged, since the canvas is always CANVAS_WIDTH wide.
export const fromCanvasState = (state: CanvasState, screenWidth: number): CanvasState => {
  if (state.version !== CANVAS_STATE_VERSION) {
    throw new Error(`Unsupported canvas state version ${state.version}`);
  }
  const k = screenWidth / state.screenWidth;
  if (k === 1) return state;
  const s = (v: number) => v * k;
  const rect = (r: CanvasRect | null) =>
    r ? { left: s(r.left), top: s(r.top), width: s(r.width), height: s(r.height) } : null;
  return {
    ...state,
    screenWidth,
    screenHeight: s(state.screenHeight),
    textElements: state.textElements.map(el => ({
      ...el,
      x: s(el.x),
      y: s(el.y),
      originalX: el.originalX === null ? null : s(el.originalX),
      originalY: el.originalY === null ? null : s(el.originalY),
      fontSize: s(el.fontSize),
      letterSpacing: s(el.letterSpacing),
    })),
    stickerElements: state.stickerElements.map(st => ({
      ...st, x: s(st.x), y: s(st.y), width: s(st.width), height: s(st.height),
    })),
    imageBackgroundPosition: { x: s(state.imageBackgroundPosition.x), y: s(state.imageBackgroundPosition.y) },
    cropTop: s(state.cropTop),
    cropBottom: s(state.cropBottom),
    repost: state.repost ? { ...state.repost, stripRect: rect(state.repost.stripRect) } : null,
  };
};
