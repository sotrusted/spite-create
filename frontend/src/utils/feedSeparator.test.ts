import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separatorColor } from './feedSeparator';

const solid = (c: string) => ({ background_color: c });

test('yellow over highlighter green gets a dark line', () => {
  assert.equal(separatorColor(solid('#F0FF00'), solid('#CCFF00')), '#000000');
});

test('the same colour twice gets a line; dark posts get a light one', () => {
  assert.equal(separatorColor(solid('#000000'), solid('#000000')), '#FFFFFF');
  assert.equal(separatorColor(solid('#F8F8FF'), solid('#F8F8FF')), '#000000');
});

test('clearly different posts get none', () => {
  assert.equal(separatorColor(solid('#F0FF00'), solid('#0000EE')), null);
  assert.equal(separatorColor(solid('#FF1A1A'), solid('#FF940A')), null);
});

test('gradients meet at their end stops; images never get a line', () => {
  const ramp = { background_color: '#0000EE', background_gradient: ['#0000EE', '#F0FF00'] };
  assert.equal(separatorColor(ramp, solid('#CCFF00')), '#000000'); // its bottom is yellow
  assert.equal(separatorColor(solid('#CCFF00'), ramp), null); // its top is blue
  assert.equal(separatorColor({ background_color: '#F0FF00', background_image: 'x.jpg' }, solid('#F0FF00')), null);
});
