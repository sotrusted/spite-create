// Mirrors RainbowVisibilityTests on the server: the composer must skip the
// same rainbow colours the render does, or the preview lies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rainbowFor, Colors } from './colors';

test('a matching solid background drops its own colour', () => {
  const palette = rainbowFor('#FF1A1A');
  assert.ok(!palette.includes('#FF1A1A'));
  assert.equal(palette.length, 5);
});

test('near matches are dropped too', () => {
  assert.ok(!rainbowFor('#F0FF00').includes('#FFD700'));
});

test('unrelated backgrounds, gradients and images keep the whole rainbow', () => {
  assert.equal(rainbowFor('#000000').length, 6);
  assert.deepEqual(rainbowFor(null), Colors.rainbowPalette);
});
