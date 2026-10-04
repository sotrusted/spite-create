import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, clampPinch, offsetAfterPinch } from './zoom';

test('zoom stays between 1 and the limit', () => {
  assert.equal(clampZoom(0.5, 4), 1);
  assert.equal(clampZoom(6, 4), 4);
  assert.equal(clampPinch(3, 2, 4), 2); // 2 x 3 would pass 4
  assert.equal(clampPinch(0.2, 2, 4), 0.5); // never below zoom 1
});

test('every point lands where the live transform showed it', () => {
  const offset = { x: 120, y: 340 };
  const origin = { x: 300, y: 900 };
  const s = 2.5;
  const after = offsetAfterPinch(offset, origin, s);
  for (const p of [{ x: 0, y: 0 }, { x: 300, y: 900 }, { x: 410, y: 1500 }]) {
    const live = { x: origin.x + (p.x - origin.x) * s - offset.x, y: origin.y + (p.y - origin.y) * s - offset.y };
    const committed = { x: p.x * s - after.x, y: p.y * s - after.y };
    assert.ok(Math.abs(live.x - committed.x) < 1e-9 && Math.abs(live.y - committed.y) < 1e-9);
  }
});
