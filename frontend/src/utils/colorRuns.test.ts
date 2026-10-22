import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyColorToRange, adjustRuns, colorSpans, duoRun, runsToCodePoints, runsFromCodePoints, RAINBOW_RUN } from './colorRuns';

const R = '#FF1A1A';
const B = '#0000EE';
const none = () => '';

test('colouring a range cuts around what was there', () => {
  const runs = applyColorToRange([], 0, 10, R);
  assert.deepEqual(applyColorToRange(runs, 3, 5, B), [
    { start: 0, end: 3, color: R }, { start: 3, end: 5, color: B }, { start: 5, end: 10, color: R },
  ]);
});

test('resetting a range gives it back; same-colour neighbours merge', () => {
  const runs = applyColorToRange(applyColorToRange([], 0, 4, R), 4, 8, R);
  assert.deepEqual(runs, [{ start: 0, end: 8, color: R }]);
  assert.deepEqual(applyColorToRange(runs, 2, 6, null), [
    { start: 0, end: 2, color: R }, { start: 6, end: 8, color: R },
  ]);
});

test('typing before a run shifts it; typing inside or at its end grows it', () => {
  const runs = [{ start: 2, end: 4, color: R }]; // "ab[cd]ef"
  assert.deepEqual(adjustRuns('abcdef', 'XXabcdef', runs), [{ start: 4, end: 6, color: R }]);
  assert.deepEqual(adjustRuns('abcdef', 'abcXdef', runs), [{ start: 2, end: 5, color: R }]);
  assert.deepEqual(adjustRuns('abcdef', 'abcdXef', runs), [{ start: 2, end: 5, color: R }]);
  // right at its start: the new letter is not coloured
  assert.deepEqual(adjustRuns('abcdef', 'abXcdef', runs), [{ start: 3, end: 5, color: R }]);
  // after it: untouched
  assert.deepEqual(adjustRuns('abcdef', 'abcdeXf', runs), runs);
});

test('deleting shrinks or removes a run', () => {
  const runs = [{ start: 2, end: 4, color: R }];
  assert.deepEqual(adjustRuns('abcdef', 'abdef', runs), [{ start: 2, end: 3, color: R }]);
  assert.deepEqual(adjustRuns('abcdef', 'abef', runs), []);
  assert.deepEqual(adjustRuns('abcdef', 'af', runs), []);
  assert.deepEqual(adjustRuns('abcdef', 'cdef', runs), [{ start: 0, end: 2, color: R }]);
});

test('spans: ranges over the element colour, markers stay plain', () => {
  const spans = colorSpans('ab\ncd', [{ start: 1, end: 4, color: R }], null, line => (line ? '- ' : ''));
  assert.deepEqual(spans, [
    { text: '- a', color: null }, { text: 'b', color: R }, { text: '\n- ', color: null },
    { text: 'c', color: R }, { text: 'd', color: null },
  ]);
});

test('spans: the rainbow keeps cycling under a range', () => {
  const spans = colorSpans('abc', [{ start: 1, end: 2, color: R }], ['#1', '#2', '#3'], none);
  assert.deepEqual(spans.map(s => s.color), ['#1', R, '#3']);
});

test('caps lock that lengthens a letter shifts later runs with it', () => {
  // 'ß' uppercases to 'SS': a run on the 'x' after it moves one place on
  assert.deepEqual(runsToCodePoints('ßx', [{ start: 1, end: 2, color: R }], ch => ch.toUpperCase()),
    [{ start: 2, end: 3, color: R }]);
});

test('offsets become code points for the server', () => {
  // the emoji is two UTF-16 units but one code point
  assert.deepEqual(runsToCodePoints('😀ab', [{ start: 2, end: 3, color: R }]), [{ start: 1, end: 2, color: R }]);
});

test('code points come back to UTF-16 offsets', () => {
  const runs = [{ start: 1, end: 2, color: R }];
  assert.deepEqual(runsFromCodePoints('😀ab', runs), [{ start: 2, end: 3, color: R }]);
  assert.deepEqual(runsFromCodePoints('😀ab', runsToCodePoints('😀ab', [{ start: 2, end: 3, color: R }])),
    [{ start: 2, end: 3, color: R }]);
});

test('a rainbow range cycles over its own letters, as the server does', () => {
  // 'ab cde f' with "cde" rainbow: the server's charColors are
  // [None, None, P0, P1, P2, None] over the visible letters
  const spans = colorSpans('ab cde f', [{ start: 3, end: 6, color: RAINBOW_RUN }], null, none, ['#1', '#2', '#3', '#4']);
  assert.deepEqual(spans, [
    { text: 'ab ', color: null },
    { text: 'c', color: '#1' },
    { text: 'd', color: '#2' },
    { text: 'e', color: '#3' },
    { text: ' f', color: null },
  ]);
});

test('a duo range alternates its two colours over its own letters, as the server does', () => {
  // 'ab cde fg' with "b cd" one duo and "fg" another: each starts on its
  // first colour, spaces skipped
  const spans = colorSpans('ab cde fg', [
    { start: 1, end: 5, color: duoRun(R, B) },
    { start: 7, end: 9, color: duoRun(B, R) },
  ], null, none);
  assert.deepEqual(spans, [
    { text: 'a', color: null },
    { text: 'b ', color: R },
    { text: 'c', color: B },
    { text: 'd', color: R },
    { text: 'e ', color: null },
    { text: 'f', color: B },
    { text: 'g', color: R },
  ]);
});
