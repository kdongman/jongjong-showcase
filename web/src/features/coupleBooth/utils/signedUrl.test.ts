import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGNED_URL_TTL_SECONDS,
} from '@shared/types';
import {
  clearSignedUrlCache,
  createSignedBoothUrl,
  extractSignedUrlHttpStatus,
  hasCachedSignedUrl,
  isSignedUrlCacheValid,
  shouldRetrySignedUrlError,
  signedUrlBackoffMs,
  signedUrlCacheKey,
  summarizeSignedUrlFailures,
} from './signedUrl';

describe('signedUrl recovery', () => {
  beforeEach(() => {
    clearSignedUrlCache();
  });

  it('retries transient 502 errors with backoff then succeeds', async () => {
    let calls = 0;
    const waits: number[] = [];
    const outcome = await createSignedBoothUrl(
      'couple/session/user/cutout.png',
      async () => {
        calls += 1;
        if (calls < 3) {
          const error = new Error('HTTP 502 error');
          (error as Error & { statusCode?: number }).statusCode = 502;
          throw error;
        }
        return { signedUrl: 'https://signed.example/cutout?token=secret' };
      },
      {
        soft: true,
        random: () => 0,
        sleepFn: async (ms) => {
          waits.push(ms);
        },
      },
    );
    assert.equal(calls, 3);
    assert.equal(outcome.url, 'https://signed.example/cutout?token=secret');
    assert.deepEqual(waits, [signedUrlBackoffMs(0, () => 0), signedUrlBackoffMs(1, () => 0)]);
    assert.equal(hasCachedSignedUrl('couple/session/user/cutout.png'), true);
  });

  it('reuses a cached signed url before expiry', async () => {
    let calls = 0;
    const now = { value: 1_000_000 };
    await createSignedBoothUrl(
      'path/a.jpg',
      async () => {
        calls += 1;
        return { signedUrl: 'https://signed.example/a' };
      },
      { nowMs: () => now.value },
    );
    const cached = await createSignedBoothUrl(
      'path/a.jpg',
      async () => {
        calls += 1;
        return { signedUrl: 'https://signed.example/a-new' };
      },
      { nowMs: () => now.value + 1_000 },
    );
    assert.equal(calls, 1);
    assert.equal(cached.url, 'https://signed.example/a');
    assert.equal(cached.cached, true);
  });

  it('does not cache failures', async () => {
    await createSignedBoothUrl(
      'path/fail.jpg',
      async () => {
        throw Object.assign(new Error('HTTP 502 error'), { statusCode: 502 });
      },
      {
        soft: true,
        random: () => 0,
        sleepFn: async () => undefined,
      },
    );
    assert.equal(hasCachedSignedUrl('path/fail.jpg'), false);
  });

  it('scopes cache keys by bucket so identical paths do not collide', async () => {
    assert.notEqual(
      signedUrlCacheKey('couple-booth', 'shared/path.jpg'),
      signedUrlCacheKey('other-bucket', 'shared/path.jpg'),
    );
    await createSignedBoothUrl(
      'shared/path.jpg',
      async () => ({ signedUrl: 'https://signed.example/booth' }),
      { bucket: 'couple-booth' },
    );
    await createSignedBoothUrl(
      'shared/path.jpg',
      async () => ({ signedUrl: 'https://signed.example/other' }),
      { bucket: 'other-bucket' },
    );
    assert.equal(hasCachedSignedUrl('shared/path.jpg', 'couple-booth'), true);
    assert.equal(hasCachedSignedUrl('shared/path.jpg', 'other-bucket'), true);

    let boothCalls = 0;
    const boothHit = await createSignedBoothUrl(
      'shared/path.jpg',
      async () => {
        boothCalls += 1;
        return { signedUrl: 'https://signed.example/booth-new' };
      },
      { bucket: 'couple-booth' },
    );
    assert.equal(boothCalls, 0);
    assert.equal(boothHit.url, 'https://signed.example/booth');
  });

  it('reissues expired urls instead of serving stale cache', async () => {
    let calls = 0;
    const now = { value: 1_000_000 };
    await createSignedBoothUrl(
      'path/expired.jpg',
      async () => {
        calls += 1;
        return { signedUrl: 'https://signed.example/old' };
      },
      { nowMs: () => now.value },
    );
    now.value += (SIGNED_URL_TTL_SECONDS * 1000) + 1;
    const refreshed = await createSignedBoothUrl(
      'path/expired.jpg',
      async () => {
        calls += 1;
        return { signedUrl: 'https://signed.example/new' };
      },
      { nowMs: () => now.value },
    );
    assert.equal(calls, 2);
    assert.equal(refreshed.url, 'https://signed.example/new');
    assert.equal(refreshed.cached, undefined);
  });

  it('does not cache results from aborted in-flight requests', async () => {
    const controller = new AbortController();
    let resolveSign: ((value: { signedUrl: string }) => void) | undefined;
    const pending = createSignedBoothUrl(
      'path/aborted.jpg',
      () => new Promise((resolve) => {
        resolveSign = resolve;
      }),
      { signal: controller.signal, soft: true },
    );
    controller.abort();
    resolveSign?.({ signedUrl: 'https://signed.example/should-not-cache' });
    await assert.rejects(
      () => pending,
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    );
    assert.equal(hasCachedSignedUrl('path/aborted.jpg'), false);
  });

  it('does not retry after abort', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => createSignedBoothUrl(
        'path/b.jpg',
        async () => ({ signedUrl: 'https://signed.example/b' }),
        { signal: controller.signal, soft: true },
      ),
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    );
    assert.equal(hasCachedSignedUrl('path/b.jpg'), false);
  });

  it('classifies 502 as retryable and soft-fails with status', async () => {
    assert.equal(shouldRetrySignedUrlError({ statusCode: 502, message: 'HTTP 502 error' }), true);
    assert.equal(extractSignedUrlHttpStatus({ message: 'StorageApiError: HTTP 502 error' }), 502);
    assert.equal(isSignedUrlCacheValid({ url: 'x', expiresAtMs: Date.now() + 120_000 }), true);
    assert.equal(isSignedUrlCacheValid({ url: 'x', expiresAtMs: Date.now() + 10_000 }), false);

    const outcome = await createSignedBoothUrl(
      'path/c.jpg',
      async () => {
        throw Object.assign(new Error('HTTP 502 error'), { statusCode: 502 });
      },
      {
        soft: true,
        random: () => 0,
        sleepFn: async () => undefined,
      },
    );
    assert.equal(outcome.url, undefined);
    assert.equal(outcome.status, 502);
    assert.equal(outcome.attempts, 3);
    assert.equal(hasCachedSignedUrl('path/c.jpg'), false);
    assert.match(summarizeSignedUrlFailures([{
      pathSuffix: 'c.jpg',
      kind: 'cutout',
      status: 502,
      attempts: 3,
    }]) ?? '', /storage 502/);
  });
});
