import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { contrastRatio, hexToRgb } from '../utils/contrast';
import type { Rect } from '../utils/hitTest';

// A brief flash over the part of a post a press acted on - the whole post,
// or the quoted post under the finger. It never takes touches, so nothing
// waits on it.

export interface PressFlashHandle {
  // rect in the parent's coordinates (points); none flashes the whole parent
  flash: (rect?: Rect | null, color?: string, peak?: number) => void;
}

// White or black, whichever reads on the given background
export const flashColorOn = (background: string) => {
  const bg = hexToRgb(background);
  return contrastRatio(bg, [255, 255, 255]) >= contrastRatio(bg, [0, 0, 0])
    ? '#FFFFFF'
    : '#000000';
};

const PressFlash = forwardRef<PressFlashHandle>((_props, ref) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const [area, setArea] = useState<{ rect: Rect | null; color: string }>({ rect: null, color: '#FFFFFF' });
  useImperativeHandle(ref, () => ({
    flash(rect = null, color = '#FFFFFF', peak = 0.25) {
      setArea({ rect, color });
      opacity.stopAnimation();
      Animated.sequence([
        Animated.timing(opacity, { toValue: peak, duration: 60, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start();
    },
  }), [opacity]);
  const { rect, color } = area;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        rect
          ? { position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height }
          : StyleSheet.absoluteFill,
        { backgroundColor: color, opacity },
      ]}
    />
  );
});

export default PressFlash;
