import test from 'node:test';
import assert from 'node:assert/strict';
import { capsOf, fieldText, readEdit, toField, toTyped, FieldOptions } from './editField';

const plain: FieldOptions = { caps: false, marker: () => '' };
const caps: FieldOptions = { caps: true, marker: () => '' };
const bullets: FieldOptions = { caps: false, marker: () => '• ' };
const numbers: FieldOptions = { caps: false, marker: n => `${n}. ` };

// Type into the field as iOS would: replace [start, end) of what is drawn
const type = (typed: string, opts: FieldOptions, start: number, end: number, text: string) => {
  const before = fieldText(typed, opts);
  return readEdit(typed, before, before.slice(0, start) + text + before.slice(end), opts);
};

test('plain text: the field is the typed text', () => {
  assert.equal(fieldText('Hello\nworld', plain), 'Hello\nworld');
  assert.deepEqual(type('Hello', plain, 5, 5, '!'), { typed: 'Hello!', caret: 6 });
  assert.deepEqual(type('Hello', plain, 1, 4, ''), { typed: 'Ho', caret: 1 });
});

test('caps: drawn in capitals, letter for letter', () => {
  assert.equal(fieldText('Hi there', caps), 'HI THERE');
  assert.equal(capsOf('straße'), 'STRAßE');
});

test('caps: letters typed with caps on are kept lower case', () => {
  assert.equal(type('Hi there', caps, 2, 2, ' YOU').typed, 'Hi you there');
});

test('caps: the text from before caps keeps its case through edits around it', () => {
  // delete "THERE", type "BOB"
  const r = type('Hi there Sam', caps, 3, 8, 'BOB');
  assert.equal(r.typed, 'Hi bob Sam');
});

test('lists: a marker before every non-blank line', () => {
  assert.equal(fieldText('one\n\ntwo', bullets), '• one\n\n• two');
  assert.equal(fieldText('a\nb', numbers), '1. a\n2. b');
});

test('lists: indexes map past the markers', () => {
  const t = 'one\ntwo';
  assert.equal(toField(t, 0, bullets), 2);
  assert.equal(toField(t, 4, bullets), 8);
  assert.equal(toTyped(t, 2, bullets), 0);
  assert.equal(toTyped(t, 8, bullets), 4);
  // inside a marker is its line's start
  assert.equal(toTyped(t, 1, bullets), 0);
  assert.equal(toTyped(t, 6, bullets), 4);
  for (let i = 0; i <= t.length; i++) assert.equal(toTyped(t, toField(t, i, bullets), bullets), i);
});

test('lists: typing on a line', () => {
  assert.deepEqual(type('one', bullets, 5, 5, '!'), { typed: 'one!', caret: 4 });
});

test('lists: a return makes a new line, which gets its own marker when drawn', () => {
  const r = type('one', numbers, 6, 6, '\n');
  assert.deepEqual(r, { typed: 'one\n', caret: 4 });
  const r2 = type(r.typed, numbers, 7, 7, 'x');
  assert.deepEqual(r2, { typed: 'one\nx', caret: 5 });
  assert.equal(fieldText(r2.typed, numbers), '1. one\n2. x');
});

test('lists: a backspace into a marker joins the line to the one before', () => {
  // '• one\n• two': backspace the space of the second marker
  assert.deepEqual(type('one\ntwo', bullets, 7, 8, ''), { typed: 'onetwo', caret: 3 });
  // ... or the whole marker
  assert.deepEqual(type('one\ntwo', bullets, 6, 8, ''), { typed: 'onetwo', caret: 3 });
});

test('lists: a backspace into the first marker does nothing', () => {
  assert.deepEqual(type('one', bullets, 1, 2, ''), { typed: 'one', caret: 0 });
});

test('lists: a selection across a marker deletes the letters, not the marker', () => {
  // '• one\n• two': select "ne\n• tw"
  assert.deepEqual(type('one\ntwo', bullets, 3, 10, ''), { typed: 'oo', caret: 1 });
});

test('numbers renumber after a line is removed', () => {
  const r = type('a\nb\nc', numbers, 4, 9, '');
  assert.equal(fieldText(r.typed, numbers), '1. a\n2. c');
});
