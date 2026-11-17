import * as Haptics from 'expo-haptics';

// Small taps under the finger. Never awaited and never allowed to throw: a
// device without a haptic engine (or with haptics switched off) just stays
// still.

// An action taken: quote, post, save
export const tap = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

// Something clicked into place: a dragged text catching the centre line
export const tick = () => {
  Haptics.selectionAsync().catch(() => {});
};
