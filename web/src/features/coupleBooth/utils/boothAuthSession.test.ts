import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BoothTokenError } from '@shared/tokenError';
import { resolveBoothAuthSession, type AuthSessionLike } from './boothAuthSession';

function session(partial: Partial<AuthSessionLike> & { access_token: string; user: { id: string } }): AuthSessionLike {
  return {
    expires_at: 2_000_000_000,
    ...partial,
  };
}

describe('resolveBoothAuthSession', () => {
  it('throws AUTH_SESSION_MISSING when session is null', async () => {
    await assert.rejects(
      () => resolveBoothAuthSession({
        getSession: async () => ({ data: { session: null } }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
      }),
      (error: unknown) => error instanceof BoothTokenError && error.code === 'AUTH_SESSION_MISSING',
    );
  });

  it('returns current session when not near expiry', async () => {
    let refreshed = 0;
    const result = await resolveBoothAuthSession({
      getSession: async () => ({
        data: {
          session: session({
            access_token: 'tok',
            user: { id: 'user-a' },
            expires_at: 2_000_000_000,
          }),
        },
      }),
      refreshSession: async () => {
        refreshed += 1;
        return { data: { session: null }, error: null };
      },
      nowSec: 1_000_000_000,
      expectedUserId: 'user-a',
    });
    assert.equal(result.accessToken, 'tok');
    assert.equal(result.userId, 'user-a');
    assert.equal(result.refreshed, false);
    assert.equal(refreshed, 0);
  });

  it('refreshes once when session is expired or near expiry', async () => {
    let refreshed = 0;
    const result = await resolveBoothAuthSession({
      getSession: async () => ({
        data: {
          session: session({
            access_token: 'old',
            user: { id: 'user-a' },
            expires_at: 1_000_000_030,
          }),
        },
      }),
      refreshSession: async () => {
        refreshed += 1;
        return {
          data: {
            session: session({
              access_token: 'new',
              user: { id: 'user-a' },
              expires_at: 2_000_000_000,
            }),
          },
          error: null,
        };
      },
      nowSec: 1_000_000_000,
      skewSec: 60,
    });
    assert.equal(result.accessToken, 'new');
    assert.equal(result.refreshed, true);
    assert.equal(refreshed, 1);
  });

  it('does not retry refresh after failure', async () => {
    let refreshed = 0;
    await assert.rejects(
      () => resolveBoothAuthSession({
        getSession: async () => ({
          data: {
            session: session({
              access_token: 'old',
              user: { id: 'user-a' },
              expires_at: 1,
            }),
          },
        }),
        refreshSession: async () => {
          refreshed += 1;
          return { data: { session: null }, error: { message: 'fail' } };
        },
        nowSec: 100,
      }),
      (error: unknown) => error instanceof BoothTokenError && error.code === 'AUTH_TOKEN_EXPIRED',
    );
    assert.equal(refreshed, 1);
  });

  it('rejects mismatched auth user', async () => {
    await assert.rejects(
      () => resolveBoothAuthSession({
        getSession: async () => ({
          data: {
            session: session({
              access_token: 'tok',
              user: { id: 'user-a' },
            }),
          },
        }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
        expectedUserId: 'user-b',
      }),
      (error: unknown) => error instanceof BoothTokenError && error.code === 'AUTH_USER_MISMATCH',
    );
  });
});
