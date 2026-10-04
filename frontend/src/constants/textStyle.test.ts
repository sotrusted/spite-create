import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUTLINE } from './textStyle';

test('outline width matches shared/style.json', () => {
  const shared = JSON.parse(readFileSync(join(__dirname, '../../../shared/style.json'), 'utf8'));
  assert.equal(OUTLINE.widthEm, shared.outlineWidthEm);
});
