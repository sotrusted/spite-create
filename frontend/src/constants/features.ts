// Feature gates. Image uploads are fully built and golden-tested but banked
// for a post-launch release: flipping imageUploads to true restores the image
// background button, the swipe-up picker, the sticker picker, and crop bars.
// The backend has a matching gate: ALLOW_IMAGE_POSTS in settings.py.
export const FEATURES = {
  imageUploads: false,
  // Signatures (sign toggle, canvas band preview, feed band) are parked
  // until the band's design and placement are settled; backend fields stay.
  signatures: false,
  // Tap-to-collapse (the "minimize" chip). Parked while the interaction is
  // reconsidered; the whole recursive renderer stays in PostCard, so
  // flipping this back to true restores it.
  collapsePosts: false,
  // Post page draws text as real text from the server's draw list over a
  // text-free render (sharp when zoomed). Guarded by the server's
  // TextPlanParityTests and tools/parity_check.py (every font x style,
  // mixed fonts, nested quotes): run the latter before changing text drawing.
  vectorPostText: true,
};
