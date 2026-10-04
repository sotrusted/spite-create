import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textResolutionFor } from './zoom';

test('text is redrawn at the smallest whole resolution covering the zoom', () => {
  assert.equal(textResolutionFor(1, 4), 1);
  assert.equal(textResolutionFor(1.02, 4), 1); // a settle wobble is not a zoom
  assert.equal(textResolutionFor(1.4, 4), 2);
  assert.equal(textResolutionFor(2, 4), 2);
  assert.equal(textResolutionFor(3.6, 4), 4);
  assert.equal(textResolutionFor(9, 4), 4);
});
