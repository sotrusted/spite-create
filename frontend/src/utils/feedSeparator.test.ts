import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separatorColor } from './feedSeparator';
import { RULE_ON } from '../constants/rules';
import { Colors } from '../constants/colors';

const solid = (c: string) => ({ background_color: c });
const palette = Colors.postColors;

test('every palette colour has a companion rule, itself a palette colour', () => {
  assert.deepEqual(Object.keys(RULE_ON).sort(), [...palette].sort());
  for (const [bg, rule] of Object.entries(RULE_ON)) {
    assert.ok(palette.includes(rule), `${rule} is not in the palette`);
    assert.notEqual(rule, bg);
  }
});

test('the same colour twice gets its companion', () => {
  assert.equal(separatorColor(solid('#FAEBD7'), solid('#FAEBD7')), '#690016');
  assert.equal(separatorColor(solid('#000000'), solid('#000000')), '#B7BEC7');
});

test('different posts get none, near-twins included', () => {
  assert.equal(separatorColor(solid('#3D3D42'), solid('#690016')), null);
  assert.equal(separatorColor(solid('#F0FF00'), solid('#CCFF00')), null);
  assert.equal(separatorColor(solid('#F0FF00'), solid('#0000EE')), null);
  assert.equal(separatorColor(solid('#FF1A1A'), solid('#FF940A')), null);
});

test('gradients meet at their end stops; images never get a line', () => {
  const ramp = { background_color: '#0000EE', background_gradient: ['#0000EE', '#F0FF00'] };
  assert.equal(separatorColor(ramp, solid('#F0FF00')), '#0000EE');
  assert.equal(separatorColor(solid('#F0FF00'), ramp), null);
  assert.equal(separatorColor({ background_color: '#F0FF00', background_image: 'x.jpg' }, solid('#F0FF00')), null);
});
