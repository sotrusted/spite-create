// "Edit again" must bring back EXACTLY what was posted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCanvasState, fromCanvasState } from './canvasState';
import { buildPostPayload, ComposerSnapshot } from './buildPostPayload';
import { CanvasTextElement } from '../types/canvas';

const element: CanvasTextElement = {
  id: '1', content: 'EDIT ME\nsecond line', x: 180, y: 400, originalX: 170, originalY: 390,
  fontSize: 30, color: '#FF1A1A', fontFamily: 'caveat', hasBackground: true,
  backgroundColor: '#FFFFFF', backgroundMode: 'white', capsLock: false, scale: 1.4,
  letterSpacing: 2, opacity: 0.8, glow: true, rainbow: false, alternateColors: ['#FF1A1A', '#0000EE'],
  align: 'left', bold: true, italic: false, underline: true, listStyle: 'bullet',
};

const snapshot = (w: number, h: number, el: CanvasTextElement) => ({
  screenWidth: w, screenHeight: h, textElements: [el], stickerElements: [],
  backgroundColor: '#FFD700', backgroundGradient: [], backgroundImage: null,
  imageBackgroundScale: 1, imageBackgroundPosition: { x: 0, y: 0 }, imageCoverScale: 1,
  cropTop: 0, cropBottom: h, isSigned: false,
});

test('state survives a JSON round trip (it is stored as JSON)', () => {
  const state = toCanvasState(snapshot(402, 874, element));
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('restoring on the same screen gives back exactly what was saved', () => {
  const state = toCanvasState(snapshot(402, 874, element));
  assert.deepEqual(fromCanvasState(state, 402), state);
  assert.deepEqual(fromCanvasState(state, 402).textElements[0], element);
});

test('restoring on another width renders the same post', () => {
  const state = toCanvasState(snapshot(402, 874, element));
  const restored = fromCanvasState(state, 375);
  const before = buildPostPayload(snapshot(402, 874, element) as ComposerSnapshot);
  const after = buildPostPayload(snapshot(375, restored.screenHeight, restored.textElements[0]) as ComposerSnapshot);
  const a = before.text_elements![0] as any, b = after.text_elements![0] as any;
  for (const key of ['x', 'y', 'fontSize', 'letterSpacing']) {
    assert.ok(Math.abs(a[key] - b[key]) <= 1, `${key}: ${a[key]} vs ${b[key]}`);
  }
  assert.equal(b.content, a.content);
});

test('unknown versions are refused rather than half-restored', () => {
  const state = { ...toCanvasState(snapshot(402, 874, element)), version: 99 } as any;
  assert.throws(() => fromCanvasState(state, 402));
});
