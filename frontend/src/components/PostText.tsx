import React, { useState } from 'react';
import { Text, TextStyle, View } from 'react-native';
import { FontChoices, resolveFontFace, rainbowFor } from '../constants/colors';
import { OUTLINE } from '../constants/textStyle';
import { colorSpans, runsFromCodePoints } from '../utils/colorRuns';
import { TEXT_WRAP_FRACTION } from '../utils/buildPostPayload';
import OutlinedText from './OutlinedText';
import type { TextElement } from '../types';

// A post's text drawn as real text from its saved elements (canvas px), the
// way the server draws it and the composer previews it - so it can sit over
// the post's text-free render and stay sharp at any zoom.
//
// Placement: `scale` points per canvas px; (offsetX, offsetY) is where the
// canvas origin lands in the parent, in points.

export const LIST_MARKERS: Record<string, string> = { bullet: '• ', dash: '- ', star: '* ' };

// Matches the server's chip: max(8px, 0.25em) by max(4px, 0.1em)
const CHIP = { minX: 8, emX: 0.25, minY: 4, emY: 0.1 };
const GLOW_EM = 0.12;

interface Props {
  elements: TextElement[];
  scale: number;
  offsetX: number;
  offsetY: number;
  canvasWidth: number;
  // the post's solid background (rainbow skips colours lost in it); null on
  // a gradient or image
  background: string | null;
  selectable?: boolean;
}

export default function PostText({ elements, ...placement }: Props) {
  return (
    <>
      {elements.map((el, i) => (el?.content?.trim() ? <PlacedText key={i} el={el} {...placement} /> : null))}
    </>
  );
}

function PlacedText({ el, scale, offsetX, offsetY, canvasWidth, background, selectable }: Omit<Props, 'elements'> & { el: TextElement }) {
  // Centred on (x, y) like the server's middle anchor, once measured
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const fontSize = el.fontSize * scale;
  const family = (el.fontFamily in FontChoices ? el.fontFamily : 'arial-black') as keyof typeof FontChoices;
  const listStyle = el.listStyle ?? 'none';
  const raw = el.content.replace(/\s+$/, '');

  let counter = 0;
  const prefix = (line: string) => {
    if (listStyle === 'none' || !line.trim()) return '';
    if (listStyle === 'number') return `${++counter}. `;
    return LIST_MARKERS[listStyle] ?? '';
  };
  const cycle = el.alternateColors?.length === 2 ? el.alternateColors : el.rainbow ? rainbowFor(background) : null;
  const runs = runsFromCodePoints(raw, el.colorRuns);
  const spans = colorSpans(raw, runs, cycle, prefix);
  const plain = spans.map(s => s.text).join('');
  const chip = el.hasBackground;
  const spacing = (el.letterSpacing || 0) * scale;

  const style: TextStyle = {
    fontFamily: resolveFontFace(family, !!el.bold, !!el.italic),
    fontWeight: FontChoices[family].fontWeight,
    fontSize,
    color: el.color,
    textAlign: listStyle !== 'none' ? 'left' : el.align || 'center',
    textDecorationLine: el.underline ? 'underline' : 'none',
    backgroundColor: chip ? el.backgroundColor : 'transparent',
    paddingHorizontal: chip ? Math.max(CHIP.minX, el.fontSize * CHIP.emX) * scale : 0,
    paddingVertical: chip ? Math.max(CHIP.minY, el.fontSize * CHIP.emY) * scale : 0,
    letterSpacing: spacing,
    marginRight: -spacing,
    opacity: el.opacity ?? 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
    maxWidth: canvasWidth * TEXT_WRAP_FRACTION * scale,
    ...(el.glow
      ? { textShadowColor: el.color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: Math.max(2, fontSize * GLOW_EM) }
      : {}),
  };

  const x = offsetX + el.x * scale;
  const y = offsetY + el.y * scale;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: size ? x - size.width / 2 : x,
        top: size ? y - size.height / 2 : y,
        opacity: size ? 1 : 0,
      }}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || Math.abs(size.width - width) > 0.5 || Math.abs(size.height - height) > 0.5) {
          setSize({ width, height });
        }
      }}
    >
      <OutlinedText
        style={style}
        outlineColor={el.outlineColor ?? null}
        outlineWidth={fontSize * OUTLINE.widthEm}
        plain={plain}
        selectable={selectable}
      >
        {spans.map((s, i) => (s.color ? <Text key={i} style={{ color: s.color }}>{s.text}</Text> : s.text))}
      </OutlinedText>
    </View>
  );
}
