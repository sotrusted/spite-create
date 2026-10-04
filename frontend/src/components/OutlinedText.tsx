import React from 'react';
import { StyleSheet, Text, TextStyle, View, StyleProp } from 'react-native';

// Text with a border around its letters, drawn the way the server strokes
// it: the plain text repeated in the border colour around a ring of
// OUTLINE_STEPS offsets, the real (coloured) text on top. React Native has
// no text stroke, and its one text shadow cannot ring the glyphs.
//
// Scale, opacity and the chip background belong to the whole stack, so
// they move to the wrapper (the chip under the border); the copies are
// plain ink.
export const OUTLINE_STEPS = 16;

interface Props {
  style: StyleProp<TextStyle>;
  outlineColor: string | null;
  outlineWidth: number; // points, before the element's scale
  plain: string; // the displayed text without colour spans (for the copies)
  onLayout?: React.ComponentProps<typeof Text>['onLayout'];
  selectable?: boolean;
  children: React.ReactNode;
}

export default function OutlinedText({ style, outlineColor, outlineWidth, plain, onLayout, selectable, children }: Props) {
  if (!outlineColor || outlineWidth <= 0) {
    return <Text style={style} onLayout={onLayout} selectable={selectable}>{children}</Text>;
  }
  const { transform, opacity, backgroundColor, ...text } = StyleSheet.flatten(style) as TextStyle;
  const ink: TextStyle = {
    ...text,
    color: outlineColor,
    backgroundColor: 'transparent',
    textShadowColor: 'transparent',
    textDecorationColor: outlineColor,
  };
  return (
    // the chip (backgroundColor) goes under the border, as on the server
    <View style={{ transform, opacity, backgroundColor }}>
      {Array.from({ length: OUTLINE_STEPS }, (_, i) => {
        const a = (i / OUTLINE_STEPS) * 2 * Math.PI;
        const dx = Math.cos(a) * outlineWidth;
        const dy = Math.sin(a) * outlineWidth;
        return (
          <Text
            key={i}
            style={[ink, styles.copy, { left: dx, right: -dx, top: dy }]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {plain}
          </Text>
        );
      })}
      <Text style={text} onLayout={onLayout} selectable={selectable}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { position: 'absolute' },
});
