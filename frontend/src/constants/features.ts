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
  // Post page draws text as real text over a text-free render (sharp when
  // zoomed). Off until it is driven by the server's draw list and passes
  // the parity checks; until then the post page shows the server's image.
  vectorPostText: false,
};
