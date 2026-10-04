import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoOutlineColor, resolveOutlineColor, applyFontChange, outlineAfterTextColor, startingStyle, nextOutline } from './outline';
import { Colors } from '../constants/colors';

test('auto: the contrasting one of black and white', () => {
  assert.equal(autoOutlineColor('#F8F8FF', null), '#000000'); // white text, black border
  assert.equal(autoOutlineColor('#000000', null), '#F8F8FF'); // black text, white border
});

test('auto: never the solid background colour', () => {
  // white text on black: a black border would vanish into the background
  const border = autoOutlineColor('#F8F8FF', '#000000');
  assert.notEqual(border, '#000000');
  assert.notEqual(border, '#F8F8FF');
  // black text on white: a white border would vanish
  const other = autoOutlineColor('#000000', '#F8F8FF');
  assert.notEqual(other, '#F8F8FF');
  assert.notEqual(other, '#000000');
});

test('off draws nothing, custom draws its colour', () => {
  assert.equal(resolveOutlineColor({ mode: 'off' }, '#000000', null), null);
  assert.equal(resolveOutlineColor(undefined, '#000000', null), null);
  assert.equal(resolveOutlineColor({ mode: 'custom', color: '#FF1A1A' }, '#000000', null), '#FF1A1A');
});

test('Impact starts in capitals with a border', () => {
  assert.deepEqual(startingStyle('impact'), { capsLock: true, outline: { mode: 'auto' } });
  assert.deepEqual(startingStyle('courier-prime'), { capsLock: false, outline: { mode: 'off' } });
});

test('switching font moves untouched style to the new font, keeps what the user changed', () => {
  const plain = { fontFamily: 'arial-black' as const, capsLock: false, outline: { mode: 'off' as const } };
  assert.deepEqual(applyFontChange(plain, 'impact'),
    { fontFamily: 'impact', capsLock: true, outline: { mode: 'auto' } });
  const impact = { fontFamily: 'impact' as const, capsLock: true, outline: { mode: 'auto' as const } };
  assert.deepEqual(applyFontChange(impact, 'courier-prime'),
    { fontFamily: 'courier-prime', capsLock: false, outline: { mode: 'off' } });
  // turned caps off and picked a red border on Impact: both survive a switch
  const tuned = { fontFamily: 'impact' as const, capsLock: false, outline: { mode: 'custom' as const, color: '#FF1A1A' } };
  assert.deepEqual(applyFontChange(tuned, 'courier-prime'),
    { fontFamily: 'courier-prime', capsLock: false, outline: { mode: 'custom', color: '#FF1A1A' } });
});

test('a new text colour puts a picked border back to following it', () => {
  assert.deepEqual(outlineAfterTextColor({ mode: 'custom', color: '#FF1A1A' }), { mode: 'auto' });
  assert.deepEqual(outlineAfterTextColor({ mode: 'off' }), { mode: 'off' });
});

test('tapping the border steps off, auto, every other palette colour, off', () => {
  const text = '#FF1A1A';
  const seen: string[] = [];
  let setting = nextOutline({ mode: 'off' }, text);
  assert.deepEqual(setting, { mode: 'auto' });
  for (;;) {
    setting = nextOutline(setting, text);
    if (setting.mode !== 'custom') break;
    seen.push(setting.color);
  }
  assert.deepEqual(setting, { mode: 'off' });
  assert.deepEqual(seen, Colors.postColors.filter(c => c !== text));
});
