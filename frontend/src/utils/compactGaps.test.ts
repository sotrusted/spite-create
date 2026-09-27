import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactGaps } from './compactGaps';

test('a caption far above a quote closes to the cap', () => {
  const caption = { top: 100, bottom: 140 };
  const quote = { top: 500, bottom: 800 };
  assert.deepEqual(compactGaps([caption, quote], 48), [0, -(500 - 140 - 48)]);
});

test('gaps under the cap are left as placed', () => {
  assert.deepEqual(compactGaps([{ top: 100, bottom: 140 }, { top: 170, bottom: 400 }], 48), [0, 0]);
});

test('shifts accumulate down the stack, whatever the input order', () => {
  const bands = [{ top: 900, bottom: 950 }, { top: 0, bottom: 50 }, { top: 400, bottom: 450 }];
  // 350 closes to 48 (-302), then the next 450 closes to 48 (-402 more)
  assert.deepEqual(compactGaps(bands, 48), [-704, 0, -302]);
});

test('overlapping bands move as one block', () => {
  const bands = [{ top: 0, bottom: 50 }, { top: 400, bottom: 700 }, { top: 650, bottom: 720 }];
  assert.deepEqual(compactGaps(bands, 48), [0, -302, -302]);
});

test('a band nested inside a taller one measures its gap from the taller bottom', () => {
  const bands = [{ top: 0, bottom: 500 }, { top: 10, bottom: 20 }, { top: 540, bottom: 600 }];
  assert.deepEqual(compactGaps(bands, 48), [0, 0, 0]);
});

test('nothing to do with one band or none', () => {
  assert.deepEqual(compactGaps([], 48), []);
  assert.deepEqual(compactGaps([{ top: 300, bottom: 400 }], 48), [0]);
});
