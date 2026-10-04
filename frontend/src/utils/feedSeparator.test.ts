import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separatorColor, SEPARATOR } from './feedSeparator';
import { RULE_ON, RULE_BETWEEN } from '../constants/rules';
import { Colors } from '../constants/colors';
import { hexToRgb } from './contrast';

const solid = (c: string) => ({ background_color: c });
const palette = Colors.postColors;
const dist = (a: string, b: string) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

test('every palette colour has a companion rule, itself a palette colour', () => {
  assert.deepEqual(Object.keys(RULE_ON).sort(), [...palette].sort());
  for (const [bg, rule] of Object.entries(RULE_ON)) {
    assert.ok(palette.includes(rule), `${rule} is not in the palette`);
    assert.notEqual(rule, bg);
  }
});

test('every near-twin pair has its own rule, from the palette', () => {
  const twins: string[] = [];
  palette.forEach((a, i) => palette.slice(i + 1).forEach(b => {
    if (dist(a, b) < SEPARATOR.similarDistance) twins.push(`${a}|${b}`);
  }));
  assert.deepEqual(Object.keys(RULE_BETWEEN).sort(), twins.sort());
  for (const rule of Object.values(RULE_BETWEEN)) assert.ok(palette.includes(rule));
});

test('yellow over highlighter gets link blue', () => {
  assert.equal(separatorColor(solid('#F0FF00'), solid('#CCFF00')), '#0000EE');
  assert.equal(separatorColor(solid('#CCFF00'), solid('#F0FF00')), '#0000EE');
});

test('the same colour twice gets its companion', () => {
  assert.equal(separatorColor(solid('#FAEBD7'), solid('#FAEBD7')), '#690016');
  assert.equal(separatorColor(solid('#000000'), solid('#000000')), '#B7BEC7');
});

test('clearly different posts get none', () => {
  assert.equal(separatorColor(solid('#F0FF00'), solid('#0000EE')), null);
  assert.equal(separatorColor(solid('#FF1A1A'), solid('#FF940A')), null);
});

test('gradients meet at their end stops; images never get a line', () => {
  const ramp = { background_color: '#0000EE', background_gradient: ['#0000EE', '#F0FF00'] };
  assert.equal(separatorColor(ramp, solid('#CCFF00')), '#0000EE');
  assert.equal(separatorColor(solid('#CCFF00'), ramp), null);
  assert.equal(separatorColor({ background_color: '#F0FF00', background_image: 'x.jpg' }, solid('#F0FF00')), null);
});
