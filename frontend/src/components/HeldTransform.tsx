import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import AnimatedReanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

// A held text element (being dragged, pinched, or both) is moved and scaled
// on the UI thread, by how far the hold has taken it from its committed
// place and scale: the composer re-renders only when the hold ends, not on
// every frame of it. Not held, it is drawn as is.

interface Props {
  active: boolean;
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  scale: SharedValue<number>; // held scale / committed scale
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// (a ref through to the view: the gesture handler around it finds it so)
const HeldTransform = React.forwardRef<any, Props>(({ active, dx, dy, scale, style, children }, ref) => {
  const held = useAnimatedStyle(() => ({
    transform: active
      ? [{ translateX: dx.value }, { translateY: dy.value }, { scale: scale.value }]
      : [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }],
  }), [active]);
  return <AnimatedReanimated.View ref={ref} style={[style, held]}>{children}</AnimatedReanimated.View>;
});

export default HeldTransform;
