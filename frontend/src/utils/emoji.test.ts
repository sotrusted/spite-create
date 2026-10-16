import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMOJI_RANGES, stripEmoji } from './emoji';

test('emoji ranges match shared/emoji.json', () => {
  const shared = JSON.parse(readFileSync(join(__dirname, '../../../shared/emoji.json'), 'utf8'));
  assert.deepEqual(EMOJI_RANGES.map(r => [...r]), shared.ranges.map((r: string[]) => r.map(Number)));
});

test('emoji are dropped and text symbols kept, as the server does', () => {
  const cases: [string, string][] = [
    ['hi \u{1F600}!', 'hi !'],
    ['I ❤️ u', 'I  u'], // the emoji keyboard's heart
    ['I ❤ u ★', 'I ❤ u ★'], // typed as text symbols
    ['\u{1F468}‍\u{1F469}‍\u{1F467} x', ' x'],
    ['\u{1F1FA}\u{1F1F8} \u{1F44D}\u{1F3FD} 1️⃣', '  '],
    ['क्‍ष', 'क्‍ष'], // a joiner inside Devanagari stays
  ];
  for (const [text, expected] of cases) assert.equal(stripEmoji(text), expected, JSON.stringify(text));
});
