import test from 'node:test';
import assert from 'node:assert/strict';
import { caretSpot, caretX, displayIndex } from './caret';

const line = (text: string, y: number, x = 0) => ({ x, y, width: text.length * 10, height: 20, text });

// "I wish I was hyper right now.\n\nBut not" laid out in 4 lines
const text = 'I wish I was hyper right now.\n\nBut not';
const lines = [line('I wish I was hyper ', 0), line('right now.\n', 20), line('\n', 40), line('But not', 60)];

test('an index inside a line lands on it, with the text before it', () => {
  assert.deepEqual(caretSpot(lines, text, 2), { line: 0, prefix: 'I ', blank: false, below: false });
});

test('an index at a soft wrap is the next line\'s start', () => {
  assert.deepEqual(caretSpot(lines, text, 19), { line: 1, prefix: '', blank: false, below: false });
});

test('before a newline is the end of that line, newline left out', () => {
  assert.deepEqual(caretSpot(lines, text, 29), { line: 1, prefix: 'right now.', blank: false, below: false });
});

test('a blank line is blank', () => {
  assert.deepEqual(caretSpot(lines, text, 30), { line: 2, prefix: '', blank: true, below: false });
});

test('the end of the text is the end of the last line', () => {
  assert.deepEqual(caretSpot(lines, text, text.length), { line: 3, prefix: 'But not', blank: false, below: false });
});

test('after a final newline the caret goes below the last line', () => {
  const t = 'hello\n';
  assert.deepEqual(caretSpot([line('hello\n', 0)], t, t.length), { line: 0, prefix: '', blank: true, below: true });
});

test('an empty last line, when reported, is where the caret goes', () => {
  const t = 'hello\n';
  assert.deepEqual(caretSpot([line('hello\n', 0), line('', 20)], t, t.length), { line: 1, prefix: '', blank: true, below: false });
});

test('no lines yet, no caret', () => {
  assert.equal(caretSpot([], '', 0), null);
});

test('x: line start plus the width before the caret; blank lines by alignment', () => {
  const spot = caretSpot(lines, text, 2)!;
  assert.equal(caretX({ ...lines[0], x: 15 }, spot, 20, 300, 'center'), 35);
  const blank = caretSpot(lines, text, 30)!;
  assert.equal(caretX(lines[2], blank, 0, 300, 'center'), 150);
  assert.equal(caretX(lines[2], blank, 0, 300, 'left'), 0);
  assert.equal(caretX(lines[2], blank, 0, 300, 'right'), 300);
});

test('list markers shift the index by every marker up to its line', () => {
  const bullet = () => '• ';
  assert.equal(displayIndex('one\ntwo', 0, bullet), 2);
  assert.equal(displayIndex('one\ntwo', 5, bullet), 9);
  // blank lines get no marker
  assert.equal(displayIndex('one\n\ntwo', 4, bullet), 6);
  assert.equal(displayIndex('one\n\ntwo', 5, bullet), 9);
  const number = (n: number) => `${n}. `;
  assert.equal(displayIndex('a\nb', 2, number), 8);
});
