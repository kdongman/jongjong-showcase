import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidBoothSessionId, normalizeActiveBoothSessionResult } from './entry';

const id = '5cae74e5-d59d-462e-97df-27cdbaf41d37';

test('normalizes the explicit entry RPC object and one-row PostgREST array', () => {
  assert.deepEqual(normalizeActiveBoothSessionResult({ session_id: id, created: true }), { sessionId: id, created: true });
  assert.deepEqual(normalizeActiveBoothSessionResult([{ session_id: id, created: false }]), { sessionId: id, created: false });
});

test('rejects missing, legacy-shaped, and invalid entry result values', () => {
  for (const value of [null, [], [{ session_id: id }], { id, created: true }, { session_id: 'null', created: true }]) {
    assert.throws(() => normalizeActiveBoothSessionResult(value));
  }
  assert.equal(isValidBoothSessionId(id), true);
  assert.equal(isValidBoothSessionId('undefined'), false);
});
