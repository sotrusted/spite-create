import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atLeast, pickPinchTarget, quotedPostAt } from './hitTest';

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
