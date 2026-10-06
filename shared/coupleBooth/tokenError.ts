type TokenFailureBody = {
  code?: unknown;
  message?: unknown;
  error?: unknown;
  phase?: unknown;
  request_id?: unknown;
};

type FunctionErrorLike = {
  name?: unknown;
  context?: unknown;
  message?: unknown;
};

export type BoothTokenErrorCode =
  | 'INVALID_SESSION_ID'
  | 'UNAUTHORIZED'
  | 'AUTH_SESSION_MISSING'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_USER_MISMATCH'
  | 'SESSION_NOT_FOUND'
  | 'NOT_SESSION_PARTICIPANT'
  | 'SESSION_EXPIRED'
  | 'MEDIA_EXPIRED'
  | 'SESSION_NOT_MEDIA_ELIGIBLE'
  | 'SESSION_ROOM_MISSING'
  | 'LIVEKIT_CONFIG_MISSING'
  | 'LIVEKIT_ROOM_NAME_INVALID'
  | 'LIVEKIT_IDENTITY_INVALID'
  | 'TOKEN_CONFIG_ERROR'
  | 'TOKEN_ISSUANCE_FAILED'
  | 'UNKNOWN';

export class BoothTokenError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: BoothTokenErrorCode,
    public readonly requestId?: string,
    public readonly phase?: string,
    public readonly messageText?: string,
  ) {
    super(code);
    this.name = 'BoothTokenError';
  }
}

export type BoothTokenDiagnostics = {
  attemptId?: number;
  sessionKey?: string;
  guestMode?: boolean;
  retryCount?: number;
  authSessionPresent?: boolean;
  authUserIdMasked?: string;
  authExpiresInSec?: number | null;
  vercelOrigin?: string;
  supabaseProjectRef?: string;
  boothSessionIdMasked?: string;
};

export function maskId(value: string | null | undefined): string | undefined {
  if (!value || value.length < 8) return value ? '<id>' : undefined;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function isAuthFatalTokenCode(code: BoothTokenErrorCode): boolean {
  return (
    code === 'AUTH_SESSION_MISSING'
    || code === 'AUTH_TOKEN_EXPIRED'
    || code === 'AUTH_TOKEN_INVALID'
    || code === 'AUTH_USER_MISMATCH'
    || code === 'UNAUTHORIZED'
    || code === 'NOT_SESSION_PARTICIPANT'
  );
}

export function isNonRetryableTokenCode(code: BoothTokenErrorCode): boolean {
  return isAuthFatalTokenCode(code) || code === 'SESSION_NOT_FOUND' || code === 'INVALID_SESSION_ID';
}

function tokenErrorCode(value: unknown): BoothTokenErrorCode {
  switch (value) {
    case 'INVALID_SESSION_ID':
    case 'UNAUTHORIZED':
    case 'AUTH_SESSION_MISSING':
    case 'AUTH_TOKEN_EXPIRED':
    case 'AUTH_TOKEN_INVALID':
    case 'AUTH_USER_MISMATCH':
    case 'SESSION_NOT_FOUND':
    case 'NOT_SESSION_PARTICIPANT':
    case 'SESSION_EXPIRED':
    case 'MEDIA_EXPIRED':
    case 'SESSION_NOT_MEDIA_ELIGIBLE':
    case 'SESSION_ROOM_MISSING':
    case 'LIVEKIT_CONFIG_MISSING':
    case 'LIVEKIT_ROOM_NAME_INVALID':
    case 'LIVEKIT_IDENTITY_INVALID':
    case 'TOKEN_CONFIG_ERROR':
    case 'TOKEN_ISSUANCE_FAILED':
      return value;
    default:
      return 'UNKNOWN';
  }
}

function normalizeAuthCode(status: number, code: BoothTokenErrorCode): BoothTokenErrorCode {
  if (code === 'LIVEKIT_CONFIG_MISSING') return 'TOKEN_CONFIG_ERROR';
  if (code === 'LIVEKIT_ROOM_NAME_INVALID') return 'SESSION_ROOM_MISSING';
  if (status === 401 && code === 'UNAUTHORIZED') return 'AUTH_TOKEN_INVALID';
  return code;
}

async function readFailureBody(context: unknown): Promise<TokenFailureBody | null> {
  if (!context || typeof context !== 'object') return null;
  const response = context as {
    clone?: () => { json?: () => Promise<unknown> };
    json?: () => Promise<unknown>;
  };
  try {
    const value = await (response.clone?.().json?.() ?? response.json?.());
    return value && typeof value === 'object' ? value as TokenFailureBody : null;
  } catch {
    return null;
  }
}

function bodyMessage(body: TokenFailureBody | null): string | undefined {
  if (!body) return undefined;
  if (typeof body.message === 'string') return body.message;
  if (typeof body.error === 'string') return body.error;
  return undefined;
}

/** Logs only safe diagnostics; credentials and generated tokens are excluded. */
export async function toBoothTokenRequestError(error: unknown, diagnostics?: BoothTokenDiagnostics): Promise<BoothTokenError> {
  const functionError = (error && typeof error === 'object' ? error : {}) as FunctionErrorLike;
  const kind = typeof functionError.name === 'string' ? functionError.name : 'UnknownFunctionError';
  const response = functionError.context as { status?: unknown } | undefined;
  const body = kind === 'FunctionsHttpError' ? await readFailureBody(functionError.context) : null;
  const status = typeof response?.status === 'number' ? response.status : 0;
  const rawCode = tokenErrorCode(body?.code);
  const code = normalizeAuthCode(status, rawCode);
  const message = bodyMessage(body);
  console.error('[couple-booth-token]', {
    ...diagnostics,
    kind,
    status,
    code,
    message,
    phase: typeof body?.phase === 'string' ? body.phase : undefined,
    requestId: typeof body?.request_id === 'string' ? body.request_id : undefined,
  });
  return new BoothTokenError(
    status,
    code,
    typeof body?.request_id === 'string' ? body.request_id : undefined,
    typeof body?.phase === 'string' ? body.phase : undefined,
    message,
  );
}
