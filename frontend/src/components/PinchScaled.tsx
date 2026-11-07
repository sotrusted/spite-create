import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import AnimatedReanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

// A text element mid-pinch is scaled on the UI thread, by how far the pinch
// has taken it from its committed scale: the composer re-renders only when
// the pinch ends, not on every frame of it. Inactive, it is drawn as is.

interface Props {
  active: boolean;
  live: SharedValue<number>; // pinched scale / committed scale
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

// (a ref through to the view: the gesture handler around it finds it so)
const PinchScaled = React.forwardRef<any, Props>(({ active, live, style, children }, ref) => {
  const scaled = useAnimatedStyle(() => ({ transform: [{ scale: active ? live.value : 1 }] }), [active]);
  return <AnimatedReanimated.View ref={ref} style={[style, scaled]}>{children}</AnimatedReanimated.View>;
});

export default PinchScaled;
