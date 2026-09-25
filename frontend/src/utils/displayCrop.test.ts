// The card chrome floor. These bounds are display-only: the server's
// top_y/bottom_y stay the content extent so quoted strips are cut tight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayCropBounds } from './displayCrop';
import { MIN_CARD_HEIGHT, CHROME, SPACE } from '../constants/space';

const CANVAS_W = 1080;
const CANVAS_H = 2340;
const SCREEN_W = 393;
const FLOOR = MIN_CARD_HEIGHT * (CANVAS_W / SCREEN_W);

const crop = (top: number, bottom: number, canvasH = CANVAS_H) =>
  displayCropBounds(top, bottom, CANVAS_W, canvasH, SCREEN_W);

test('leaves a tall post untouched', () => {
  assert.deepEqual(crop(400, 1800), { topY: 400, bottomY: 1800 });
});

test('pads a one-line post out to the chrome floor', () => {
  const c = crop(1100, 1250);
  assert.ok(Math.abs(c.bottomY - c.topY - FLOOR) < 1e-6);
});

test('keeps the content optically centred when it pads', () => {
  const c = crop(1100, 1250);
  assert.ok(Math.abs((c.topY + c.bottomY) / 2 - 1175) < 1e-6);
});

test('clamps to the top of the canvas without shrinking below the floor', () => {
  const c = crop(0, 80);
  assert.equal(c.topY, 0);
  assert.ok(Math.abs(c.bottomY - c.topY - FLOOR) < 1e-6);
});

test('clamps to the bottom of the canvas without shrinking below the floor', () => {
  const c = crop(CANVAS_H - 80, CANVAS_H);
  assert.equal(c.bottomY, CANVAS_H);
  assert.ok(Math.abs(c.bottomY - c.topY - FLOOR) < 1e-6);
});

test('never overflows a canvas shorter than the floor', () => {
  const shortCanvas = 200;
  const c = crop(90, 110, shortCanvas);
  assert.ok(c.topY >= 0);
  assert.ok(c.bottomY <= shortCanvas);
});

test('the floor actually clears the quote button', () => {
  // The whole point: a one-line card must be taller than the chrome it hosts.
  const c = crop(1100, 1250);
  const cardHeightPt = (c.bottomY - c.topY) * (SCREEN_W / CANVAS_W);
  assert.ok(cardHeightPt >= MIN_CARD_HEIGHT - 1e-6);
});

// --- [Aa] clearance -------------------------------------------------------
const K = CANVAS_W / SCREEN_W;
const buttonBlock = (CHROME.buttonHeight + CHROME.inset) * K;
const gutter = SPACE.sm * K;

test('content in the button column pushes the bottom down just enough', () => {
  // a wide line whose right end sits where the [Aa] would be
  const box: [number, number, number, number] = [100, 1100, 1060, 1500];
  const c = displayCropBounds(1060, 1540, CANVAS_W, CANVAS_H, SCREEN_W, [box]);
  assert.ok(Math.abs(c.bottomY - (1500 + gutter + buttonBlock)) < 1e-6);
  assert.equal(c.topY, 1060); // only the bottom moves
});

test('content clear of the button column leaves the crop alone', () => {
  const box: [number, number, number, number] = [400, 1100, 680, 1500]; // centred, narrow
  const c = displayCropBounds(1060, 1540, CANVAS_W, CANVAS_H, SCREEN_W, [box]);
  assert.deepEqual(c, { topY: 1060, bottomY: 1540 });
});

test('clearance is idempotent', () => {
  const boxes = [[100, 1100, 1060, 1500]];
  const once = displayCropBounds(1060, 1540, CANVAS_W, CANVAS_H, SCREEN_W, boxes);
  const twice = displayCropBounds(once.topY, once.bottomY, CANVAS_W, CANVAS_H, SCREEN_W, boxes);
  assert.deepEqual(twice, once);
});

test('a capped post whose content runs past the edge is left alone', () => {
  const box: [number, number, number, number] = [0, 200, 1080, 2300];
  const c = displayCropBounds(500, 1850, CANVAS_W, CANVAS_H, SCREEN_W, [box]);
  assert.deepEqual(c, { topY: 500, bottomY: 1850 });
});
