import { BoothTokenError } from '@shared/tokenError';

export type AuthSessionLike = {
  access_token: string;
  expires_at?: number | null;
  user?: { id?: string | null } | null;
};

export type BoothAuthSessionSnapshot = {
  accessToken: string;
  userId: string;
  expiresAt: number | null;
  refreshed: boolean;
};

const DEFAULT_SKEW_SEC = 60;

/**
 * Validates the active Supabase auth session before couple-booth-token.
 * Refresh runs at most once per call; never loops.
 */
export async function resolveBoothAuthSession(input: {
  getSession: () => Promise<{ data: { session: AuthSessionLike | null } }>;
  refreshSession: () => Promise<{
    data: { session: AuthSessionLike | null };
    error: { message?: string } | null;
  }>;
  expectedUserId?: string;
  nowSec?: number;
  skewSec?: number;
}): Promise<BoothAuthSessionSnapshot> {
  const skew = input.skewSec ?? DEFAULT_SKEW_SEC;
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);

  const { data: initial } = await input.getSession();
  let session = initial.session;

  if (!session?.access_token || !session.user?.id) {
    throw new BoothTokenError(401, 'AUTH_SESSION_MISSING', undefined, 'get_session');
  }

  if (input.expectedUserId && session.user.id !== input.expectedUserId) {
    throw new BoothTokenError(401, 'AUTH_USER_MISMATCH', undefined, 'user_mismatch');
  }

  const expiresAt = typeof session.expires_at === 'number' ? session.expires_at : null;
  const needsRefresh = expiresAt !== null && expiresAt <= now + skew;

  if (needsRefresh) {
    const refreshed = await input.refreshSession();
    if (refreshed.error || !refreshed.data.session?.access_token || !refreshed.data.session.user?.id) {
      throw new BoothTokenError(401, 'AUTH_TOKEN_EXPIRED', undefined, 'refresh_session');
    }
    session = refreshed.data.session;
    if (input.expectedUserId && session.user?.id !== input.expectedUserId) {
      throw new BoothTokenError(401, 'AUTH_USER_MISMATCH', undefined, 'user_mismatch_after_refresh');
    }
    return {
      accessToken: session.access_token,
      userId: String(session.user!.id),
      expiresAt: typeof session.expires_at === 'number' ? session.expires_at : null,
      refreshed: true,
    };
  }

  return {
    accessToken: session.access_token,
    userId: String(session.user.id),
    expiresAt,
    refreshed: false,
  };
}

export function authExpiresInSec(expiresAt: number | null | undefined, nowSec = Math.floor(Date.now() / 1000)): number | null {
  if (typeof expiresAt !== 'number') return null;
  return expiresAt - nowSec;
}
