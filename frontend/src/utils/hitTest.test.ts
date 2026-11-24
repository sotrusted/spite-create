import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atLeast, pickPinchTarget, pickTouchTarget, quotedLevelAt, quotedPostAt } from './hitTest';

const policy = { minTargetWidth: 180, minTargetHeight: 120 };
const word = (id: string, x: number, y: number) => ({ id, box: { x, y, width: 60, height: 30 } });

test('small boxes grow about their centre; big ones keep their size', () => {
  assert.deepEqual(atLeast({ x: 100, y: 100, width: 60, height: 30 }, 180, 120),
    { x: 40, y: 55, width: 180, height: 120 });
  assert.deepEqual(atLeast({ x: 0, y: 0, width: 300, height: 200 }, 180, 120),
    { x: 0, y: 0, width: 300, height: 200 });
});

test('a pinch near a short word, not on it, still takes it', () => {
  // the word spans x 100-160; the pinch centre is 50pt to its right
  assert.equal(pickPinchTarget([word('hello', 100, 100)], { x: 210, y: 115 }, null, policy), 'hello');
});

test('crowded words: the nearest real box wins', () => {
  const a = word('a', 100, 100);
  const b = word('b', 100, 150); // enlarged targets overlap a lot
  assert.equal(pickPinchTarget([a, b], { x: 130, y: 146 }, null, policy), 'b');
  assert.equal(pickPinchTarget([a, b], { x: 130, y: 120 }, null, policy), 'a');
});

test('a small word inside a big block beats the block', () => {
  const block = { id: 'block', box: { x: 0, y: 0, width: 400, height: 400 } };
  const small = word('small', 170, 185);
  assert.equal(pickPinchTarget([block, small], { x: 200, y: 200 }, null, policy), 'small');
});

test('far from everything: the selected element, else nothing', () => {
  const els = [word('a', 100, 100)];
  assert.equal(pickPinchTarget(els, { x: 400, y: 800 }, 'a', policy), 'a');
  assert.equal(pickPinchTarget(els, { x: 400, y: 800 }, null, policy), null);
  assert.equal(pickPinchTarget(els, { x: 400, y: 800 }, 'gone', policy), null);
});

test('taps resolve to the deepest quoted post containing them', () => {
  const chain = [
    { post_id: 'parent', rect: { x: 50, y: 500, width: 900, height: 800 }, hidden: false },
    { post_id: 'grandparent', rect: { x: 100, y: 900, width: 800, height: 300 }, hidden: false },
  ];
  assert.equal(quotedPostAt(chain, { x: 500, y: 200 }), null); // the reply itself
  assert.equal(quotedPostAt(chain, { x: 500, y: 600 }), 'parent');
  assert.equal(quotedPostAt(chain, { x: 500, y: 1000 }), 'grandparent');
});

test('a hidden level belongs to the level around it', () => {
  const chain = [
    { post_id: 'parent', rect: { x: 50, y: 500, width: 900, height: 800 }, hidden: false },
    { post_id: 'blocked', rect: { x: 100, y: 900, width: 800, height: 300 }, hidden: true },
  ];
  assert.equal(quotedPostAt(chain, { x: 500, y: 1000 }), 'parent');
});

test('the level under a tap carries its own strip', () => {
  const chain = [
    { post_id: 'parent', rect: { x: 50, y: 500, width: 900, height: 800 }, hidden: false },
  ];
  assert.deepEqual(quotedLevelAt(chain, { x: 500, y: 600 })?.rect, chain[0].rect);
  assert.equal(quotedLevelAt(chain, { x: 500, y: 200 }), null);
});

const box = (id: string, x: number, y: number, width: number, height: number) =>
  ({ id, x, y, halfWidth: width / 2, halfHeight: height / 2 });

test('a drag takes the text under the finger, not a big one beside it', () => {
  const big = box('big', 200, 300, 300, 200); // on top (later in the list)
  const word = box('word', 200, 480, 60, 30);
  assert.equal(pickTouchTarget([word, big], { x: 200, y: 480 }, 120), 'word');
  assert.equal(pickTouchTarget([word, big], { x: 200, y: 300 }, 120), 'big');
  // just below the big text: outside its drawn box, so it is not taken
  assert.equal(pickTouchTarget([big], { x: 200, y: 420 }, 120), null);
});

test('a short word is grabbed near it; between two, the nearer', () => {
  const a = box('a', 100, 100, 40, 20);
  const b = box('b', 100, 160, 40, 20);
  assert.equal(pickTouchTarget([a, b], { x: 100, y: 150 }, 120), 'b');
  assert.equal(pickTouchTarget([a, b], { x: 100, y: 115 }, 120), 'a');
  assert.equal(pickTouchTarget([a, b], { x: 300, y: 300 }, 120), null);
});

test('one text on another: the smaller, then the one on top', () => {
  const block = box('block', 200, 200, 300, 300);
  const small = box('small', 200, 200, 60, 30);
  assert.equal(pickTouchTarget([small, block], { x: 200, y: 200 }, 120), 'small');
  const twin = box('twin', 200, 200, 60, 30);
  assert.equal(pickTouchTarget([small, twin], { x: 200, y: 200 }, 120), 'twin');
});
