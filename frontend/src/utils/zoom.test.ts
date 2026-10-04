import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, offsetAfterZoom } from './zoom';

test('zoom stays between 1 and the limit', () => {
  assert.equal(clampZoom(0.5, 4), 1);
  assert.equal(clampZoom(6, 4), 4);
  assert.equal(clampZoom(2.5, 4), 2.5);
});

test('the point under the fingers stays put', () => {
  // content point 300,500 under the fingers at 100,200 with offset 200,300
  const after = offsetAfterZoom({ x: 200, y: 300 }, { x: 100, y: 200 }, 1, 2);
  assert.deepEqual(after, { x: 500, y: 800 }); // 600,1000 is now under 100,200
});

test('zooming out to 1 never scrolls past the start', () => {
  assert.deepEqual(offsetAfterZoom({ x: 10, y: 10 }, { x: 200, y: 200 }, 2, 1), { x: 0, y: 0 });
});
