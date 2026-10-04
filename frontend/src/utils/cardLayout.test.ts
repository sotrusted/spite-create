import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD, canvasPointIn, feedCardLayout, fullPostLayout } from './cardLayout';

const W = 440; // screen points
const post = (top: number, bottom: number) => ({ image_width: 1080, image_height: 2340, top_y: top, bottom_y: bottom });

test('a post within 5:4 fills the width', () => {
  const layout = feedCardLayout(post(800, 1300), W)!;
  assert.equal(layout.shrunk, false);
  assert.equal(layout.imageWidth, W);
  assert.equal(layout.imageLeft, 0);
});

test('a taller post is shrunk to fit 5:4, centred, never cropped', () => {
  const layout = feedCardLayout(post(100, 2200), W)!;
  assert.equal(layout.shrunk, true);
  assert.ok(Math.abs(layout.height - W * CARD.maxAspect) < 1e-6);
  assert.deepEqual(layout.crop, { topY: 100, bottomY: 2200 }); // the whole band
  assert.ok(Math.abs(layout.imageLeft * 2 + layout.imageWidth - W) < 1e-6);
});

test('the post page shows the whole band at full width', () => {
  const layout = fullPostLayout(post(100, 2200), W)!;
  assert.equal(layout.shrunk, false);
  assert.equal(layout.imageWidth, W);
  assert.ok(layout.height > W * CARD.maxAspect);
});

test('box points map back to canvas px', () => {
  const layout = feedCardLayout(post(100, 2200), W)!;
  const p = canvasPointIn(layout, { x: layout.imageLeft + 540 * layout.scale, y: 0 });
  assert.ok(Math.abs(p.x - 540) < 1e-6);
  assert.ok(Math.abs(p.y - 100) < 1e-6);
});

test('no bounds, no layout', () => {
  assert.equal(feedCardLayout({ image_width: 1080, image_height: 2340, top_y: null, bottom_y: null }, W), null);
});
