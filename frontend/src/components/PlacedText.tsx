import React, { useEffect } from 'react';
import { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import AnimatedReanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

// Where a text element is on the canvas, and how big: its place (the
// centre it is drawn about) and its pinch scale, as values on the UI thread.
// They are the only thing that places and sizes the drawn text, so a drag
// or a pinch moves it frame by frame without the composer re-rendering,
// and committing the result to state when the fingers lift changes nothing
// on screen. (With state also drawing it, the two met for a frame at the
// lift: the text showed at the held size times the new one.)
//
// The element's own values follow its state whenever that changes for any
// other reason (a restore, a reflow).

export type Placement = { x: SharedValue<number>; y: SharedValue<number>; scale: SharedValue<number> };

interface Props {
  place: Placement;
  x: number; // the element's state, followed when it changes
  y: number;
  scale: number;
  size: { width: number; height: number }; // the box, centred on the place
  // a selected element shrinks and fades as it goes in the trash
  deletion: { scale: SharedValue<number>; opacity: SharedValue<number> } | null;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}

export default function PlacedText({ place, x, y, scale, size, deletion, style, onLayout, children }: Props) {
  useEffect(() => {
    place.x.value = x;
    place.y.value = y;
    place.scale.value = scale;
  }, [x, y, scale]);

  const placed = useAnimatedStyle(() => ({
    transform: [
      { translateX: place.x.value },
      { translateY: place.y.value },
      { scale: place.scale.value * (deletion ? deletion.scale.value : 1) },
    ],
    opacity: deletion ? deletion.opacity.value : 1,
  }), [deletion]);

  return (
    <AnimatedReanimated.View
      style={[style, { left: -size.width / 2, top: -size.height / 2 }, placed]}
      onLayout={onLayout}
    >
      {children}
    </AnimatedReanimated.View>
  );
}
