import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontChoices, resolveFontFace } from '../constants/colors';
import { pickReadableColor, contrastRatio, hexToRgb } from '../utils/contrast';
import { SPACE, CHROME } from '../constants/space';

// The loading screen is a composer demo reel: the magazine's name in a chip,
// cycling through the same fonts / colors / formattings a post can use.
// Frames are precomputed once at module load; each tick is a single setState
// with zero allocation, so this is safe to mount anywhere as the generic
// loading state.

const TITLE = "Creative Mind's Ideas";
// PHOTOSENSITIVITY FLOOR: keep >= 170ms. WCAG 2.3.1 allows max 3 opposing
// luminance pairs/sec on a full field; at 240ms we max out at ~2.1. Below
// ~167ms the worst-case sequence crosses into seizure-trigger territory.
const TICK_MS = 240;

// Perceptual floor between CONSECUTIVE colors of the same element: palette
// neighbors (orchid vs magenta) read as "nothing happened" even though the
// color technically changed.
const rgbDist = (a: string, b: string) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
};
const MIN_JUMP = 120;

type Frame = {
  screen: string;
  chip: string;
  text: string;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  underline: boolean;
  letterSpacing: number;
  fontSize: number;
  padH: number;
  padV: number;
  maxWidth: `${number}%`;
};

const FONT_KEYS = Object.keys(FontChoices) as (keyof typeof FontChoices)[];
const PALETTE = Colors.postColors;

// none / bold / italic / bold+italic / underline; families without a real
// face for a style just render their base face (same rule as the composer).
const FORMATS = [
  { bold: false, italic: false, underline: false },
  { bold: true, italic: false, underline: false },
  { bold: false, italic: true, underline: false },
  { bold: false, italic: false, underline: true },
  { bold: true, italic: true, underline: false },
];

// Floor of 18: below that the long title turned into unreadable grey mush
// in the chip. Ceiling keeps it inside the narrow shapes.
const SIZES = [18, 24, 30, 21, 34, 19, 27, 22];

// Chip geometries, strictly alternating wide/narrow (including the
// wraparound) so adjacent shapes never read as near-duplicates. Narrow
// widths force the long title to wrap tall, swinging the aspect ratio.
const SHAPES: { padH: number; padV: number; maxWidth: `${number}%` }[] = [
  { padH: 28, padV: 6, maxWidth: '95%' }, // sliver
  { padH: 12, padV: 56, maxWidth: '46%' }, // tall column
  { padH: 44, padV: 36, maxWidth: '85%' }, // padded poster
  { padH: 14, padV: 18, maxWidth: '56%' }, // compact card
  { padH: 22, padV: 12, maxWidth: '78%' }, // banner
  { padH: 10, padV: 44, maxWidth: '38%' }, // narrow spine
];

// Each dimension cycles on its own period, ranked by visual mass. The two
// color fields (screen AND chip) leap every tick - they are the strobe.
// Shape flips every 2, typography every 4. Periods {1,2,4} pulse-align
// every 4 ticks: color color color+shape color color+shape+type...
const P = { chip: 1, textSeed: 1, screen: 1, font: 4, size: 2, shape: 2 };
const SHAPE_PHASE = 1;

const buildFrames = (): Frame[] => {
  const frames: Frame[] = [];
  const count = 96;
  let prevScreen = '';
  let prevChip = '';
  for (let i = 0; i < count; i++) {
    const fontKey = FONT_KEYS[Math.floor(i / P.font) % FONT_KEYS.length];
    const format = FORMATS[Math.floor(i / P.font) % FORMATS.length];
    let screenIndex = (Math.floor(i / P.screen) * 7) % PALETTE.length;
    if (i % P.screen === 0) {
      // On its change tick the screen must actually LEAP, not shade-shift
      while (prevScreen && rgbDist(PALETTE[screenIndex], prevScreen) < MIN_JUMP) {
        screenIndex = (screenIndex + 1) % PALETTE.length;
      }
    } else if (prevScreen) {
      screenIndex = PALETTE.indexOf(prevScreen);
    }
    const screen = PALETTE[screenIndex];
    let chipIndex = (Math.floor(i / P.chip) * 4 + 3) % PALETTE.length;
    // The chip must read against the screen AND jump visibly from its own
    // previous color
    for (let guard = 0; guard < PALETTE.length; guard++) {
      const ok =
        PALETTE[chipIndex] !== screen &&
        contrastRatio(hexToRgb(PALETTE[chipIndex]), hexToRgb(screen)) >= 1.4 &&
        (!prevChip || rgbDist(PALETTE[chipIndex], prevChip) >= MIN_JUMP);
      if (ok) break;
      chipIndex = (chipIndex + 1) % PALETTE.length;
    }
    const chip = PALETTE[chipIndex];
    prevScreen = screen;
    prevChip = chip;
    const textSeed = PALETTE[(Math.floor(i / P.textSeed) * 5) % PALETTE.length];
    const shape = SHAPES[Math.floor((i + SHAPE_PHASE) / P.shape) % SHAPES.length];
    frames.push({
      screen,
      chip,
      text: pickReadableColor(chip, PALETTE, textSeed),
      fontFamily: resolveFontFace(fontKey, format.bold, format.italic),
      fontWeight: FontChoices[fontKey].fontWeight as 'normal' | 'bold',
      underline: format.underline,
      letterSpacing: Math.floor(i / P.font) % 3 === 2 ? 2 : 0,
      fontSize: SIZES[Math.floor(i / P.size) % SIZES.length],
      ...shape,
    });
  }
  return frames;
};

const FRAMES = buildFrames();

export default function LoadingScreen({ paused = false }: { paused?: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setIndex(prev => (prev + 1) % FRAMES.length);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const frame = FRAMES[index];

  return (
    <View style={[styles.screen, { backgroundColor: frame.screen }]}>
      <View
        style={[
          styles.chip,
          {
            backgroundColor: frame.chip,
            paddingHorizontal: frame.padH,
            paddingVertical: frame.padV,
            maxWidth: frame.maxWidth,
          },
        ]}
      >
        <Text
          style={{
            color: frame.text,
            fontFamily: frame.fontFamily,
            fontWeight: frame.fontWeight,
            fontSize: frame.fontSize,
            letterSpacing: frame.letterSpacing,
            textDecorationLine: frame.underline ? 'underline' : 'none',
            textAlign: 'center',
          }}
        >
          {TITLE}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chip: {
    borderWidth: 1,
    borderColor: CHROME.hairline,
  },
});
