import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { placeRun } from './planLayout';
import { FONT_METRICS } from '../constants/fontMetrics';

const fontsDir = join(__dirname, '../../assets/fonts');
const faces = readdirSync(fontsDir).map(f => f.replace(/\.(ttf|otf)$/, ''));

test('every font file the server can name has metrics and is loaded by the app', () => {
  const app = readFileSync(join(__dirname, '../../App.tsx'), 'utf8');
  for (const face of faces) {
    assert.ok(FONT_METRICS[face], `${face} has no FONT_METRICS entry`);
    assert.ok(app.includes(`'${face}': require(`), `${face} is not loaded in App.tsx`);
  }
});

test('a run sits on its baseline, scaled and offset', () => {
  const run = { text: 'Hi', fill: '#000', left: 100, baseline: 500, advance: 80 };
  const placed = placeRun(run, 'ArialBlack', 60, 0.5, 10, 20);
  assert.equal(placed.fontSize, 30);
  assert.equal(placed.left, 60);
  // baseline 20 + 250; top is the ascent above it
  assert.ok(Math.abs(placed.top - (270 - FONT_METRICS.ArialBlack.ascent * 30)) < 1e-9);
  // Times' line gap is not above its first line
  const times = placeRun(run, 'TimesNewRoman', 60, 0.5, 10, 20);
  assert.ok(Math.abs(times.top - (270 - (FONT_METRICS.TimesNewRoman.ascent - 0.0425) * 30)) < 1e-9);
  assert.ok(placed.width > 40);
});
