import test from 'node:test';
import assert from 'node:assert/strict';
import { lineBands, snapLineWidths } from './lineChips';

test('near-equal neighbours share the wider width; real steps stay', () => {
  // at 100pt the snap is 60: 500/530 merge, 300 stays its own step
  assert.deepEqual(snapLineWidths([500, 530, 300], 100), [530, 530, 300]);
});

test('snapping chains through a run of close widths', () => {
  assert.deepEqual(snapLineWidths([400, 440, 480], 100), [480, 480, 480]);
});

test('blank lines never snap', () => {
  assert.deepEqual(snapLineWidths([500, 0, 520], 100), [500, 0, 520]);
});

test('bands touch, pad the outer edges, and keep the centre', () => {
  const lines = [
    { x: 10, y: 0, width: 500, height: 120, text: 'one' },
    { x: 0, y: 120, width: 530, height: 120, text: 'two' },
  ];
  const [a, b] = lineBands(lines, 100, 25, 10, 'center');
  assert.equal(a.top, -10);
  assert.equal(a.top + a.height, b.top);           // touching
  assert.equal(b.top + b.height, 250);             // last padded down
  assert.equal(a.width, 580);                      // snapped 530 + 2 x 25
  assert.equal(a.left + a.width / 2, 10 + 250);    // centre kept
});
