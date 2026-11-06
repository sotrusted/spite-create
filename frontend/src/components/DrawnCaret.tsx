import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import type { LineBox } from '../utils/lineChips';
import { caretSpot, caretX } from '../utils/caret';

// The composer's caret, drawn on the drawn text's own lines (utils/caret).
// It lives inside the drawn text's box and moves with its scale, so it is
// wherever the letters are - the hidden field's own caret is turned off.

export type CaretRect = { x: number; y: number; height: number };

interface Props {
  lines: LineBox[]; // the drawn text's lines (onTextLayout)
  text: string; // the drawn text, as it is drawn (list markers and all)
  index: number; // the caret, in `text`
  box: { width: number; height: number }; // the drawn text's box, unscaled
  pad: { x: number; y: number }; // the drawn text's padding (highlighter)
  scale: number; // the drawn text's scale, about the box's centre
  align: 'left' | 'center' | 'right';
  color: string;
  // the drawn text's style: the width before the caret is measured in it
  measureStyle: StyleProp<TextStyle>;
  onPlace?: (rect: CaretRect) => void; // in the box, scaled
}

// iOS's caret: 2pt wide, solid while it moves, then blinking
const WIDTH = 2;
const BLINK_MS = 500;

export default function DrawnCaret({ lines, text, index, box, pad, scale, align, color, measureStyle, onPlace }: Props) {
  // The text the lines describe; until the new text is laid out they
  // describe the old one, and the caret stays where it was
  const laidOut = lines.map(l => l.text).join('');
  // (caps are drawn as capitals: the lines hold them)
  const current = laidOut.toLowerCase() === text.toLowerCase();
  const contentWidth = box.width - 2 * pad.x;
  // No text yet: no lines, so the caret is an empty line filling the box
  const lineBoxes = text ? lines : [{ x: 0, y: 0, width: 0, height: box.height - 2 * pad.y, text: '' }];
  const spot = current || !text ? caretSpot(lineBoxes, text, index) : null;

  // The width before the caret, measured in the drawn text's own style. A
  // measurement holds for that text in that face, size and spacing only;
  // the measuring text is a new one for each, so it is always laid out
  const prefix = spot?.prefix ?? '';
  const flat = StyleSheet.flatten(measureStyle) ?? {};
  const measureKey = prefix && JSON.stringify([
    prefix, flat.fontFamily, flat.fontSize, flat.fontWeight, flat.fontStyle, flat.letterSpacing, flat.textTransform,
  ]);
  const [measured, setMeasured] = useState<{ key: string; width: number }>({ key: '', width: 0 });
  const prefixWidth = prefix ? (measured.key === measureKey ? measured.width : null) : 0;

  const last = useRef<CaretRect | null>(null);
  if (spot && prefixWidth !== null) {
    const line = lineBoxes[spot.line];
    const x = pad.x + caretX(line, spot, prefixWidth, contentWidth, align);
    const y = pad.y + (spot.below ? line.y + line.height : line.y);
    // the box scales about its centre
    const cx = box.width / 2;
    const cy = box.height / 2;
    last.current = { x: cx + (x - cx) * scale, y: cy + (y - cy) * scale, height: line.height * scale };
  }
  const rect = last.current;

  // Solid on every move, blinking once it rests
  const opacity = useRef(new Animated.Value(1)).current;
  const key = rect ? `${rect.x},${rect.y},${rect.height}` : '';
  useEffect(() => {
    if (!rect) return;
    onPlace?.(rect);
    opacity.setValue(1);
    const blink = Animated.loop(Animated.sequence([
      Animated.delay(BLINK_MS),
      Animated.timing(opacity, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.delay(BLINK_MS - 100),
      Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]));
    blink.start();
    return () => blink.stop();
  }, [key]);

  return (
    <>
      {!!measureKey && measured.key !== measureKey && (
        <Text
          key={measureKey}
          style={[measureStyle, styles.measure]}
          numberOfLines={1}
          onTextLayout={e => setMeasured({ key: measureKey, width: e.nativeEvent.lines[0]?.width ?? 0 })}
        >
          {prefix}
        </Text>
      )}
      {rect && (
        <Animated.View
          pointerEvents="none"
          style={[styles.caret, {
            left: rect.x - WIDTH / 2,
            top: rect.y,
            height: rect.height,
            backgroundColor: color,
            opacity,
          }]}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // one unwrapped line, out of sight: only its width is wanted
  measure: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 10000,
    maxWidth: undefined,
    padding: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    margin: 0,
    textAlign: 'left',
    opacity: 0,
    transform: [],
  },
  caret: {
    position: 'absolute',
    width: WIDTH,
    borderRadius: WIDTH / 2,
  },
});
