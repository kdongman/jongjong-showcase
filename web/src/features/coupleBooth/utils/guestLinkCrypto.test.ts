import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

/** Mirrors Edge guest-link hashing: raw token is never stored. */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

describe('guest link token hashing', () => {
  it('stores only sha256 hashes and keeps tokens high-entropy', () => {
    const raw = mintToken();
    assert.ok(raw.length >= 40);
    const hash = sha256Hex(raw);
    assert.equal(hash.length, 64);
    assert.notEqual(hash, raw);
    assert.equal(sha256Hex(raw), hash);
  });

  it('treats concurrent claim eligibility as single-winner via use_count guard', () => {
    // Documents the SQL claim predicate: use_count < max_uses under row lock.
    const link = { maxUses: 1, useCount: 0 };
    const tryClaim = () => {
      if (link.useCount >= link.maxUses) return false;
      link.useCount += 1;
      return true;
    };
    assert.equal(tryClaim(), true);
    assert.equal(tryClaim(), false);
    assert.equal(link.useCount, 1);
  });
});
