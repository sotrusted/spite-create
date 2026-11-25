import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Post } from '../types';
import { CHROME } from '../constants/space';
import { toggleLike, useLike } from '../utils/likes';
import { tap } from '../utils/haptics';

// The heart, drawn a square at a time: an outline until you press it, solid
// after. Seven squares by six.
const OUTLINE = [
  '.XX.XX.',
  'X..X..X',
  'X.....X',
  '.X...X.',
  '..X.X..',
  '...X...',
];
const SOLID = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
  '.XXXXX.',
  '..XXX..',
  '...X...',
];
export const HEART_RED = '#FF1A1A';

function PixelHeart({ solid, color, pixel }: { solid: boolean; color: string; pixel: number }) {
  const rows = solid ? SOLID : OUTLINE;
  return (
    <View style={{ width: 7 * pixel, height: 6 * pixel }}>
      {rows.map((row, y) => row.split('').map((cell, x) => cell === 'X' && (
        <View
          key={`${x}-${y}`}
          style={{ position: 'absolute', left: x * pixel, top: y * pixel, width: pixel, height: pixel, backgroundColor: color }}
        />
      )))}
    </View>
  );
}

type Props = {
  post: Post;
  // the button's fill and the colour drawn on it: the quote button's own
  fill: string;
  ink: string;
  // the post page's buttons are larger than a card's
  large?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Sits beside the quote button and is built like it: same box, same border.
export default function HeartButton({ post, fill, ink, large, style }: Props) {
  const { liked, count } = useLike(post);
  const width = large ? CHROME.detailButtonWidth : CHROME.buttonWidth;
  const height = large ? CHROME.detailButtonHeight : CHROME.buttonHeight;
  return (
    <TouchableOpacity
      style={[styles.button, { minWidth: width, height, backgroundColor: fill }, style]}
      onPress={() => { tap(); toggleLike(post); }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Take back heart' : 'Heart'}
      accessibilityState={{ selected: liked }}
      hitSlop={{ top: CHROME.hitSlop, left: CHROME.hitSlop, bottom: CHROME.hitSlop, right: CHROME.buttonGap / 2 }}
    >
      <PixelHeart solid={liked} color={liked ? HEART_RED : ink} pixel={large ? 3 : 2} />
      {count > 0 && (
        <Text style={[styles.count, { color: ink, fontSize: large ? 16 : 12 }]}>{count}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: CHROME.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontFamily: 'CourierPrime',
    fontWeight: '700',
    includeFontPadding: false,
    fontVariant: ['tabular-nums'],
  },
});
