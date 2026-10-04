import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { placeRun } from '../utils/planLayout';
import { OUTLINE_STEPS } from './OutlinedText';
import type { PlanElement, TextPlan } from '../types/textPlan';

// A post's text drawn from the server's draw list (types/textPlan): every
// run of glyphs at the pen position and baseline the render used, every
// chip and underline where it drew them - nothing laid out here, so line
// breaks, sizes and spacing are the render's own. Real text, so it stays
// sharp at any zoom.
//
// scale: points per canvas px of the plan's post; (offsetX, offsetY): where
// that post's canvas origin lands in the parent, in points.

interface Props {
  plan: TextPlan;
  // draw the text this many times larger and scale it back down: the same
  // positions, rasterised sharp for a view zoomed by about this much
  resolution?: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  selectable?: boolean;
}

export default function PlanText({ plan, resolution = 1, scale, offsetX, offsetY, selectable }: Props) {
  const r = resolution;
  return (
    // r times the parent's size, scaled back by 1/r about the top-left: it
    // exactly covers the parent, and has a real frame (a zero-size one hid
    // the text from VoiceOver)
    <View pointerEvents="box-none" style={[styles.hiRes, { width: `${100 * r}%`, height: `${100 * r}%`, transform: [{ scale: 1 / r }] }]}>
      {plan.elements.map((el, i) => (
        <PlanElementView key={i} el={el} scale={scale * r} offsetX={offsetX * r} offsetY={offsetY * r} selectable={selectable} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hiRes: { position: 'absolute', left: 0, top: 0, transformOrigin: [0, 0, 0] },
});

function PlanElementView({ el, scale, offsetX, offsetY, selectable }: Omit<Props, 'plan' | 'resolution'> & { el: PlanElement }) {
  const X = (x: number) => offsetX + x * scale;
  const Y = (y: number) => offsetY + y * scale;
  const stroke = el.outline ? el.stroke * scale : 0;

  const runs = (pass: 'stroke' | 'fill') => el.runs.map((run, i) => {
    const p = placeRun(run, el.face, el.size, scale, offsetX, offsetY);
    const base = {
      position: 'absolute' as const,
      top: p.top,
      width: p.width,
      fontFamily: el.face,
      fontSize: p.fontSize,
      includeFontPadding: false,
    };
    if (pass === 'stroke') {
      // the border: the run repeated round a ring of its stroke width, as
      // OutlinedText does (React Native has no text stroke)
      return Array.from({ length: OUTLINE_STEPS }, (_, k) => {
        const a = (k / OUTLINE_STEPS) * 2 * Math.PI;
        return (
          <Text
            key={`${i}-${k}`}
            numberOfLines={1}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[base, { left: p.left + Math.cos(a) * stroke, top: p.top + Math.sin(a) * stroke, color: el.outline! }]}
          >
            {run.text}
          </Text>
        );
      });
    }
    return (
      <Text
        key={i}
        numberOfLines={1}
        selectable={selectable}
        style={[base, {
          left: p.left,
          color: run.fill,
          ...(el.glow ? { textShadowColor: run.fill, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: el.glow * scale } : {}),
        }]}
      >
        {run.text}
      </Text>
    );
  });

  const lines = (pass: 'stroke' | 'fill') => el.lines.map((line, i) => {
    const thickness = (line.width + (pass === 'stroke' ? 2 * el.stroke : 0)) * scale;
    return (
      <View
        key={`l${i}`}
        style={{
          position: 'absolute',
          left: X(line.from[0]) - (pass === 'stroke' ? stroke : 0),
          top: Y(line.from[1]) - thickness / 2,
          width: (line.to[0] - line.from[0]) * scale + (pass === 'stroke' ? 2 * stroke : 0),
          height: thickness,
          backgroundColor: pass === 'stroke' ? el.outline! : line.fill,
        }}
      />
    );
  });

  return (
    // chips, ink and glow fade together, as the render's element layer does
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { opacity: el.opacity }]}>
      {el.chips.map((chip, i) => (
        <View
          key={`c${i}`}
          style={{
            position: 'absolute',
            left: X(chip.rect[0]),
            top: Y(chip.rect[1]),
            width: (chip.rect[2] - chip.rect[0]) * scale,
            height: (chip.rect[3] - chip.rect[1]) * scale,
            backgroundColor: chip.fill,
          }}
        />
      ))}
      {el.outline ? runs('stroke') : null}
      {el.outline ? lines('stroke') : null}
      {runs('fill')}
      {lines('fill')}
    </View>
  );
}
