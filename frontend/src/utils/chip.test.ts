import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipFill, inkColor, nextChip } from './chip';

test('the box button: white box, then a box of the text colour under white letters, then off', () => {
  let el: any = { color: '#FF1A1A', backgroundMode: 'off' };
  el = { ...el, ...nextChip(el) };
  assert.deepEqual([chipFill(el), inkColor(el)], ['#FFFFFF', '#FF1A1A']);
  el = { ...el, ...nextChip(el) };
  assert.deepEqual([chipFill(el), inkColor(el)], ['#FF1A1A', '#FFFFFF']);
  el = { ...el, ...nextChip(el) };
  assert.deepEqual([chipFill(el), inkColor(el)], [null, '#FF1A1A']);
});

test('a new text colour changes the letters and leaves the box', () => {
  let el: any = { color: '#FF1A1A', backgroundMode: 'white' };
  el = { ...el, ...nextChip(el), };
  el = { ...el, color: '#0000EE' };
  assert.deepEqual([chipFill(el), inkColor(el)], ['#FF1A1A', '#0000EE']);
  // turning the box off keeps the colour chosen since
  el = { ...el, ...nextChip(el) };
  assert.deepEqual([chipFill(el), inkColor(el)], [null, '#0000EE']);
});

test('a coloured box saved without its own colour follows the text colour', () => {
  const el = { color: '#FF1A1A', backgroundMode: 'inverted' as const };
  assert.deepEqual([chipFill(el), inkColor(el)], ['#FF1A1A', '#FFFFFF']);
  assert.deepEqual(nextChip(el), { backgroundMode: 'off', chipColor: undefined, color: '#FF1A1A' });
});
