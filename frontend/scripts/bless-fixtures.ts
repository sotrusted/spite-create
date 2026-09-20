// Regenerates the blessed payload fixture from the composer snapshot fixture.
// Run after intentionally changing buildPostPayload: npm run bless:fixtures
import fs from 'node:fs';
import path from 'node:path';
import { buildPostPayload } from '../src/utils/buildPostPayload';

const fixturesDir = path.join(__dirname, '..', '..', 'shared', 'fixtures');
const snapshot = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'composer-snapshot.json'), 'utf8'),
);
const payloadPath = path.join(fixturesDir, 'post-payload.json');
fs.writeFileSync(payloadPath, JSON.stringify(buildPostPayload(snapshot), null, 2) + '\n');
console.log(`blessed ${payloadPath}`);
