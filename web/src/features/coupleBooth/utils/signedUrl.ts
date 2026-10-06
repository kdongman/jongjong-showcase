import { SIGNED_URL_TTL_SECONDS } from '@shared/types';
import { pathLogSuffix } from '@shared/sameSpaceAssets';

export const SIGNED_URL_MAX_ATTEMPTS = 3;
export const SIGNED_URL_CACHE_SAFETY_MS = 60_000;
const BASE_BACKOFF_MS = 250;

export type SignedUrlIssueKind = 'original' | 'cutout' | 'final';

export type SignedUrlFailure = {
  pathSuffix: string;
  kind: SignedUrlIssueKind;
  status: number | null;
  attempts: number;
  shotId?: string;
  role?: 'host' | 'guest' | 'shared';
};

export type CreateSignedUrlFn = (
  path: string,
  expiresIn: number,
) => Promise<{ signedUrl: string }>;

type CacheEntry = {
  url: string;
  expiresAtMs: number;
};

const cache = new Map<string, CacheEntry>();
export const DEFAULT_SIGNED_URL_BUCKET = 'couple-booth';

/** Bucket-scoped cache key so distinct storage objects never collide. */
export function signedUrlCacheKey(bucket: string, path: string): string {
  return `${bucket}::${path}`;
}

export function clearSignedUrlCache(): void {
  cache.clear();
}

/** Test helper — returns whether a successful URL is currently cached. */
export function hasCachedSignedUrl(
  path: string,
  bucket = DEFAULT_SIGNED_URL_BUCKET,
  nowMs = Date.now(),
): boolean {
  const entry = cache.get(signedUrlCacheKey(bucket, path));
  return Boolean(entry && isSignedUrlCacheValid(entry, nowMs));
}

export function signedUrlBackoffMs(
  attemptIndex: number,
  random: () => number = Math.random,
): number {
  const exp = BASE_BACKOFF_MS * 2 ** attemptIndex;
  const jitter = Math.floor(random() * BASE_BACKOFF_MS);
  return exp + jitter;
}

export function isSignedUrlCacheValid(entry: CacheEntry, nowMs = Date.now()): boolean {
  return entry.expiresAtMs - SIGNED_URL_CACHE_SAFETY_MS > nowMs;
}

export function extractSignedUrlHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  const candidates = [record.statusCode, record.status, record.statusText];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) return asNumber;
      const match = value.match(/\b([45]\d{2})\b/);
      if (match) return Number(match[1]);
    }
  }
  const message = typeof record.message === 'string' ? record.message : String(error);
  const match = message.match(/\b([45]\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function shouldRetrySignedUrlError(error: unknown): boolean {
  const status = extractSignedUrlHttpStatus(error);
  if (status == null) {
    const message = String((error as { message?: string })?.message ?? error).toLowerCase();
    return (
      message.includes('502')
      || message.includes('503')
      || message.includes('504')
      || message.includes('network')
      || message.includes('fetch')
      || message.includes('timeout')
    );
  }
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function logSignedUrlAttempt(input: {
  sessionKey?: string;
  shotId?: string;
  shotIndex?: number;
  role?: string;
  assetStatus?: string;
  pathSuffix: string;
  ok: boolean;
  status: number | null;
  attempt: number;
  cached?: boolean;
  compositionRevision?: number | null;
}): void {
  console.info('[couple-booth][signed-url]', {
    sessionKey: input.sessionKey ?? null,
    shotId: input.shotId ?? null,
    shotIndex: input.shotIndex ?? null,
    participantRole: input.role ?? null,
    assetStatus: input.assetStatus ?? null,
    pathSuffix: input.pathSuffix,
    signedUrlRequest: input.ok ? 'success' : 'failure',
    httpStatus: input.status,
    attempt: input.attempt,
    cached: Boolean(input.cached),
    compositionRevision: input.compositionRevision ?? null,
  });
}

export type SignedBoothUrlOutcome = {
  url?: string;
  status: number | null;
  attempts: number;
  cached?: boolean;
};

export async function createSignedBoothUrl(
  path: string,
  createSignedUrl: CreateSignedUrlFn,
  options: {
    signal?: AbortSignal;
    bucket?: string;
    sessionKey?: string;
    shotId?: string;
    shotIndex?: number;
    role?: string;
    assetStatus?: string;
    compositionRevision?: number | null;
    soft?: boolean;
    nowMs?: () => number;
    random?: () => number;
    sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>;
  } = {},
): Promise<SignedBoothUrlOutcome> {
  const now = options.nowMs ?? Date.now;
  const bucket = options.bucket ?? DEFAULT_SIGNED_URL_BUCKET;
  const key = signedUrlCacheKey(bucket, path);
  const cached = cache.get(key);
  if (cached && isSignedUrlCacheValid(cached, now())) {
    logSignedUrlAttempt({
      sessionKey: options.sessionKey,
      shotId: options.shotId,
      shotIndex: options.shotIndex,
      role: options.role,
      assetStatus: options.assetStatus,
      pathSuffix: pathLogSuffix(path),
      ok: true,
      status: 200,
      attempt: 0,
      cached: true,
      compositionRevision: options.compositionRevision,
    });
    return { url: cached.url, status: 200, attempts: 0, cached: true };
  }
  // Drop stale entries so expired URLs are always re-issued.
  if (cached) cache.delete(key);

  let lastError: unknown;
  let lastStatus: number | null = null;
  for (let attempt = 1; attempt <= SIGNED_URL_MAX_ATTEMPTS; attempt += 1) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const data = await createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      // Abort can land while the Storage request is in flight — never cache that result.
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (!data?.signedUrl) throw new Error('SIGNED_URL_EMPTY');
      cache.set(key, {
        url: data.signedUrl,
        expiresAtMs: now() + SIGNED_URL_TTL_SECONDS * 1000,
      });
      logSignedUrlAttempt({
        sessionKey: options.sessionKey,
        shotId: options.shotId,
        shotIndex: options.shotIndex,
        role: options.role,
        assetStatus: options.assetStatus,
        pathSuffix: pathLogSuffix(path),
        ok: true,
        status: 200,
        attempt,
        compositionRevision: options.compositionRevision,
      });
      return { url: data.signedUrl, status: 200, attempts: attempt };
    } catch (error) {
      lastError = error;
      lastStatus = extractSignedUrlHttpStatus(error);
      logSignedUrlAttempt({
        sessionKey: options.sessionKey,
        shotId: options.shotId,
        shotIndex: options.shotIndex,
        role: options.role,
        assetStatus: options.assetStatus,
        pathSuffix: pathLogSuffix(path),
        ok: false,
        status: lastStatus,
        attempt,
        compositionRevision: options.compositionRevision,
      });
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (attempt >= SIGNED_URL_MAX_ATTEMPTS || !shouldRetrySignedUrlError(error)) {
        return finalizeFailure(options.soft, lastError, lastStatus, attempt);
      }
      const wait = signedUrlBackoffMs(attempt - 1, options.random);
      await (options.sleepFn ?? sleep)(wait, options.signal);
    }
  }

  return finalizeFailure(options.soft, lastError, lastStatus, SIGNED_URL_MAX_ATTEMPTS);
}

function finalizeFailure(
  soft: boolean | undefined,
  lastError: unknown,
  lastStatus: number | null,
  attempts: number,
): SignedBoothUrlOutcome {
  if (soft) return { status: lastStatus, attempts };
  const err = new Error(
    lastStatus != null
      ? `ASSET_SIGNED_URL_FAILED:${lastStatus}`
      : 'ASSET_SIGNED_URL_FAILED',
  );
  (err as Error & { cause?: unknown; status?: number | null }).cause = lastError;
  (err as Error & { status?: number | null }).status = lastStatus;
  throw err;
}

export function summarizeSignedUrlFailures(failures: SignedUrlFailure[]): string | null {
  if (!failures.length) return null;
  const statuses = [...new Set(failures.map((item) => item.status).filter((value): value is number => value != null))];
  const statusLabel = statuses.length ? statuses.join('/') : 'unknown';
  return `Some booth photos could not be loaded (storage ${statusLabel}). Tap Reload photos to try again.`;
}
