import test from 'node:test';
import assert from 'node:assert/strict';
import { scrimColorFor } from './contrast';

test('the typing dim shows on a light canvas whatever the ink', () => {
  // purple, blue and black ink used to get a white dim: none at all on white
  for (const ink of ['#9932CC', '#AB00FF', '#0000EE', '#000000', '#FF1A1A', '#F0FF00']) {
    assert.equal(scrimColorFor('#F8F8FF', ink, 0.35), '#000000', ink);
  }
});

test('the typing dim shows on a black canvas', () => {
  assert.equal(scrimColorFor('#000000', '#FF1A1A', 0.35), '#FFFFFF');
});

test('on a mid canvas the dim is the one the ink reads on', () => {
  assert.equal(scrimColorFor('#B7BEC7', '#000000', 0.35), '#FFFFFF');
  assert.equal(scrimColorFor('#B7BEC7', '#F8F8FF', 0.35), '#000000');
});

test('over a gradient or an image the dim contrasts with the ink', () => {
  assert.equal(scrimColorFor(null, '#F8F8FF', 0.35), '#000000');
  assert.equal(scrimColorFor(null, '#000000', 0.35), '#FFFFFF');
});
