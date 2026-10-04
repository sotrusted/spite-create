import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS } from './limits';

test('limits match shared/limits.json', () => {
  const { _comment, ...shared } = JSON.parse(
    readFileSync(join(__dirname, '../../../shared/limits.json'), 'utf8'),
  );
  assert.deepEqual({ ...LIMITS }, shared);
});
