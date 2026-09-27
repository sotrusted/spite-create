import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradientBandPx, GRADIENT_MIN_BAND_PX } from './gradient';

test('a short post gets the minimum band, centred on its content', () => {
  const band = gradientBandPx(1100, 1200, 2340);
  assert.equal(band.bottom - band.top, GRADIENT_MIN_BAND_PX);
  assert.equal((band.top + band.bottom) / 2, 1150);
});

test('a tall post keeps its own crop', () => {
  assert.deepEqual(gradientBandPx(200, 1800, 2340), { top: 200, bottom: 1800 });
});

test('the band never leaves the canvas', () => {
  const band = gradientBandPx(0, 80, 2340);
  assert.equal(band.top, 0);
  assert.equal(band.bottom, GRADIENT_MIN_BAND_PX);
});
