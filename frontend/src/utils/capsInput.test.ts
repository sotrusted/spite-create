import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shownText, typedAfterEdit } from './capsInput';

test('without caps the field is the text', () => {
  assert.equal(shownText('Quote', false), 'Quote');
  assert.equal(typedAfterEdit('Quote', 'Quotes', false), 'Quotes');
});

test('typing at the end keeps the typed case of what came before', () => {
  let typed = '';
  for (const ch of 'Quote the quote!') typed = typedAfterEdit(typed, shownText(typed, true) + ch, true);
  assert.equal(typed, 'Quote the quote!');
  assert.equal(shownText(typed, true), 'QUOTE THE QUOTE!');
});

test('an edit in the middle and a deletion map back by position', () => {
  assert.equal(typedAfterEdit('Hello world', 'HELLO, WORLD', true), 'Hello, world');
  assert.equal(typedAfterEdit('Hello world', 'HELLWORLD', true), 'Hellworld');
});

test('a paste replacing a selection comes in as pasted, past what still matches', () => {
  assert.equal(typedAfterEdit('one two', 'ONE Four', true), 'one Four');
});

test('a letter that capitalises to two falls back to the field', () => {
  assert.equal(typedAfterEdit('straße', 'STRASSEN', true), 'STRASSEN');
});
