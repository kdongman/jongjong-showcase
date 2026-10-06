import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'SameSpaceCompositionEditor.tsx'), 'utf8');

test('Same Space editor exposes one-shot Auto align while preserving manual controls', () => {
  assert.match(source, /data-testid="compose-auto-align"/);
  assert.match(source, /proposeBoothAutoAlignment/);
  assert.match(source, /const handleAutoAlign = \(\) =>/);
  assert.match(source, /onClick=\{handleAutoAlign\}/);
  assert.match(source, /mode: 'manual'/);
  assert.match(source, /onPlacementsChange/);
});
