import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signedInAccountLabel } from './accountIdentity';

describe('signedInAccountLabel', () => {
  it('uses email, OAuth provider, and only an eight-character test id', () => {
    assert.equal(
      signedInAccountLabel({ id: 'a1b2c3d4-e5f6', email: 'example@email.com', app_metadata: { provider: 'apple' } }, true),
      'Signed in as example@email.com · Apple · a1b2c3d4',
    );
  });

  it('falls back to metadata name and email provider', () => {
    assert.equal(
      signedInAccountLabel({ id: 'a1b2c3d4-e5f6', user_metadata: { full_name: 'Ada' }, app_metadata: { provider: 'email' } }, false),
      'Signed in as Ada · email',
    );
  });
});
