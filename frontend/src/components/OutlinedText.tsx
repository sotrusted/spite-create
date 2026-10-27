import React, { useState } from 'react';
import { StyleSheet, Text, TextStyle, View, StyleProp } from 'react-native';
import { lineBands, LineBox } from '../utils/lineChips';
import { metricsFor } from '../constants/fontMetrics';

// Text with a border around its letters, drawn the way the server strokes
// it: the plain text repeated in the border colour around a ring of
// OUTLINE_STEPS offsets, the real (coloured) text on top. React Native has
// no text stroke, and its one text shadow cannot ring the glyphs.
//
// Scale and opacity belong to the whole stack, so they move to the wrapper;
// the copies are plain ink. A background colour is the highlighter: drawn
// as a band behind each laid-out line (utils/lineChips), under the border,
// the way the server draws it - not as one box round the block.
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
  const [lines, setLines] = useState<LineBox[]>([]);
  const { transform, opacity, backgroundColor, ...text } = StyleSheet.flatten(style) as TextStyle;
  const chip = backgroundColor && backgroundColor !== 'transparent' ? (backgroundColor as string) : null;
  const outlined = !!outlineColor && outlineWidth > 0;

  if (!chip && !outlined) {
    return <Text style={style} onLayout={onLayout} selectable={selectable}>{children}</Text>;
  }

  // The text keeps its padding (so the element's box and wrapping do not
  // change); the lines iOS reports sit inside it
  const padX = Number(text.paddingHorizontal ?? text.padding ?? 0);
  const padY = Number(text.paddingVertical ?? text.padding ?? 0);
  const align = text.textAlign === 'left' || text.textAlign === 'right' ? text.textAlign : 'center';
  const fontSize = Number(text.fontSize ?? 24);
  // iOS counts the space a soft wrap leaves at a line's end into the line's
  // width; the server's line stops at its last letter
  const spaceWidth = metricsFor(String(text.fontFamily ?? '')).space * fontSize + Number(text.letterSpacing ?? 0);
  const bands = chip
    ? lineBands(
        lines.map(l => {
          const trailing = (l.text.match(/ +$/) ?? [''])[0].length;
          return { ...l, x: l.x + padX, y: l.y + padY, width: Math.max(0, l.width - trailing * spaceWidth) };
        }),
        fontSize, padX, padY, align,
      )
    : [];

  const ink: TextStyle = {
    ...text,
    color: outlineColor ?? 'transparent',
    textShadowColor: 'transparent',
    textDecorationColor: outlineColor ?? 'transparent',
  };
  return (
    <View style={{ transform, opacity }}>
      {bands.map((b, i) => (
        <View
          key={`band${i}`}
          pointerEvents="none"
          style={[styles.copy, { left: b.left, top: b.top, width: b.width, height: b.height, backgroundColor: chip! }]}
        />
      ))}
      {outlined && Array.from({ length: OUTLINE_STEPS }, (_, i) => {
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
      <Text
        style={text}
        onLayout={onLayout}
        selectable={selectable}
        onTextLayout={chip ? e => setLines(e.nativeEvent.lines) : undefined}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { position: 'absolute' },
});
