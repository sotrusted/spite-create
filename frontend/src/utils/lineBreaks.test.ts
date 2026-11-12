import test from 'node:test';
import assert from 'node:assert/strict';
import { breaksToCodePoints, softBreaks } from './lineBreaks';

const lines = (...texts: string[]) => texts.map(text => ({ text }));

test('a wrapped line breaks where the next line starts', () => {
  assert.deepEqual(softBreaks(lines('one two ', 'three'), 'one two three'), [8]);
});

test('a typed line break is not sent as a break', () => {
  assert.deepEqual(softBreaks(lines('ab\n', 'cd'), 'ab\ncd'), []);
  // ... nor when iOS leaves the newline out of the line
  assert.deepEqual(softBreaks(lines('ab', 'cd'), 'ab\ncd'), []);
  assert.deepEqual(softBreaks(lines('ab ', 'cd\n', 'ef'), 'ab cd\nef'), [3]);
});

test('a long word broken inside it', () => {
  assert.deepEqual(softBreaks(lines('abcd', 'efgh'), 'abcdefgh'), [4]);
});

test('capitals as iOS draws them', () => {
  assert.deepEqual(softBreaks(lines('HI ', 'THERE'), 'hi there'), [3]);
});

test('lines that are not this text are stale', () => {
  assert.equal(softBreaks(lines('hello'), 'help'), null);
  assert.equal(softBreaks(lines('he'), 'hello'), null);
});

test('offsets become the code points the server counts', () => {
  assert.deepEqual(breaksToCodePoints('😀ab cd', [5]), [4]);
  // capitals that are longer (ß -> SS) push the break on
  assert.deepEqual(breaksToCodePoints('ß a', [2], ch => ch.toUpperCase()), [3]);
});
