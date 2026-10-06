/**
 * Structured finalize errors — never log JWTs or storage credentials.
 */

export type BoothFinalizeErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_PAYLOAD'
  | 'INVALID_SELECTION_COUNT'
  | 'INVALID_SESSION_STATE'
  | 'INVALID_FINAL_PATH'
  | 'INVALID_MEMORY'
  | 'NOT_SESSION_PARTICIPANT'
  | 'SHOT_NOT_READY'
  | 'SHOT_NOT_IN_SESSION'
  | 'CAPTURE_ID_MISMATCH'
  | 'REVISION_CONFLICT'
  | 'SELECTION_CHANGED'
  | 'ALREADY_FINALIZED'
  | 'CLAIMED_BY_OTHER'
  | 'FINALIZATION_NOT_OWNED'
  | 'HOST_APPROVAL_REQUIRED'
  | 'GUEST_APPROVAL_REQUIRED'
  | 'RPC_NOT_FOUND'
  | 'RPC_SIGNATURE_MISMATCH'
  | 'STORAGE_OBJECT_MISSING'
  | 'DATABASE_CONSTRAINT'
  | 'INTERNAL_FINALIZE_ERROR'
  | 'UNKNOWN';

export class BoothFinalizeError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: BoothFinalizeErrorCode,
    public readonly requestId?: string,
    public readonly messageText?: string,
    public readonly stage?: string,
    public readonly retryable?: boolean,
  ) {
    super(code);
    this.name = 'BoothFinalizeError';
  }
}

export type BoothFinalizeDiagnostics = {
  finalizeRequestId?: string;
  sessionIdMasked?: string;
  selectedShotCount?: number;
  sessionStatus?: string;
};

function finalizeErrorCode(value: unknown): BoothFinalizeErrorCode {
  switch (value) {
    case 'UNAUTHORIZED':
    case 'INVALID_PAYLOAD':
    case 'INVALID_SELECTION_COUNT':
    case 'INVALID_SESSION_STATE':
    case 'INVALID_FINAL_PATH':
    case 'INVALID_MEMORY':
    case 'NOT_SESSION_PARTICIPANT':
    case 'SHOT_NOT_READY':
    case 'SHOT_NOT_IN_SESSION':
    case 'CAPTURE_ID_MISMATCH':
    case 'REVISION_CONFLICT':
    case 'SELECTION_CHANGED':
    case 'ALREADY_FINALIZED':
    case 'CLAIMED_BY_OTHER':
    case 'FINALIZATION_NOT_OWNED':
    case 'HOST_APPROVAL_REQUIRED':
    case 'GUEST_APPROVAL_REQUIRED':
    case 'RPC_NOT_FOUND':
    case 'RPC_SIGNATURE_MISMATCH':
    case 'STORAGE_OBJECT_MISSING':
    case 'DATABASE_CONSTRAINT':
    case 'INTERNAL_FINALIZE_ERROR':
      return value;
    default:
      return 'UNKNOWN';
  }
}

/** Map Postgres / PostgREST exception text into stable client codes. */
export function mapFinalizeExceptionMessage(message: string | undefined | null): BoothFinalizeErrorCode {
  const text = (message ?? '').toUpperCase();
  if (!text) return 'INTERNAL_FINALIZE_ERROR';
  if (text.includes('PGRST202') || text.includes('COULD NOT FIND THE FUNCTION')) return 'RPC_SIGNATURE_MISMATCH';
  if (text.includes('PGRST202') || text.includes('NOT FIND')) return 'RPC_NOT_FOUND';
  if (text.includes('INVALID_MEMORY')) return 'INVALID_MEMORY';
  if (text.includes('INVALID_FINAL_PATH')) return 'INVALID_FINAL_PATH';
  if (text.includes('FINALIZATION_NOT_OWNED')) return 'FINALIZATION_NOT_OWNED';
  if (text.includes('SELECTION_CHANGED')) return 'SELECTION_CHANGED';
  if (text.includes('HOST_APPROVAL')) return 'HOST_APPROVAL_REQUIRED';
  if (text.includes('GUEST_APPROVAL')) return 'GUEST_APPROVAL_REQUIRED';
  if (text.includes('INVALID_STATUS') || text.includes('INVALID_SESSION')) return 'INVALID_SESSION_STATE';
  if (text.includes('NOT_PARTICIPANT') || text.includes('NOT_COUPLE')) return 'NOT_SESSION_PARTICIPANT';
  if (text.includes('NOT_AUTHENTICATED') || text.includes('UNAUTHORIZED')) return 'UNAUTHORIZED';
  if (text.includes('SESSION_NOT_FOUND')) return 'INVALID_SESSION_STATE';
  if (text.includes('UNIQUE') || text.includes('CONSTRAINT') || text.includes('23505')) return 'DATABASE_CONSTRAINT';
  return 'INTERNAL_FINALIZE_ERROR';
}

export function httpStatusForFinalizeCode(code: BoothFinalizeErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401;
    case 'NOT_SESSION_PARTICIPANT':
      return 403;
    case 'INVALID_PAYLOAD':
    case 'INVALID_SELECTION_COUNT':
    case 'INVALID_FINAL_PATH':
    case 'INVALID_MEMORY':
    case 'SHOT_NOT_READY':
    case 'SHOT_NOT_IN_SESSION':
    case 'CAPTURE_ID_MISMATCH':
      return 400;
    case 'INVALID_SESSION_STATE':
    case 'REVISION_CONFLICT':
    case 'SELECTION_CHANGED':
    case 'CLAIMED_BY_OTHER':
    case 'FINALIZATION_NOT_OWNED':
    case 'HOST_APPROVAL_REQUIRED':
    case 'GUEST_APPROVAL_REQUIRED':
      return 409;
    case 'ALREADY_FINALIZED':
      return 200;
    case 'RPC_NOT_FOUND':
    case 'RPC_SIGNATURE_MISMATCH':
      return 500;
    default:
      return 500;
  }
}

export function boothFinalizeUserMessage(code: BoothFinalizeErrorCode): string {
  switch (code) {
    case 'INVALID_SELECTION_COUNT':
      return '최종 사진 4장을 선택해 주세요.';
    case 'SHOT_NOT_READY':
      return '사진을 준비하고 있어요. 잠시 후 다시 시도해 주세요.';
    case 'REVISION_CONFLICT':
    case 'SELECTION_CHANGED':
      return '상대가 선택을 변경했어요. 최신 선택을 불러왔어요.';
    case 'ALREADY_FINALIZED':
      return '이미 완성된 사진이 있어요.';
    case 'CLAIMED_BY_OTHER':
      return '상대가 최종 사진을 만들고 있어요. 잠시만 기다려 주세요.';
    case 'RPC_NOT_FOUND':
    case 'RPC_SIGNATURE_MISMATCH':
      return '최종 사진을 만드는 기능을 준비하지 못했어요.';
    case 'UNAUTHORIZED':
      return '로그인 정보가 만료되었어요. 다시 로그인해 주세요.';
    case 'NOT_SESSION_PARTICIPANT':
      return '이 촬영방에 참여할 권한이 없어요.';
    case 'HOST_APPROVAL_REQUIRED':
    case 'GUEST_APPROVAL_REQUIRED':
      return '두 사람의 승인이 모두 필요해요.';
    default:
      return '최종 사진을 만들지 못했어요. 다시 시도해 주세요.';
  }
}

async function readFailureBody(context: unknown): Promise<Record<string, unknown> | null> {
  if (!context || typeof context !== 'object') return null;
  const response = context as {
    clone?: () => { json?: () => Promise<unknown> };
    json?: () => Promise<unknown>;
  };
  try {
    const value = await (response.clone?.().json?.() ?? response.json?.());
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function toBoothFinalizeRequestError(
  error: unknown,
  diagnostics?: BoothFinalizeDiagnostics,
): Promise<BoothFinalizeError> {
  const functionError = (error && typeof error === 'object' ? error : {}) as {
    name?: unknown;
    context?: unknown;
    message?: unknown;
  };
  const kind = typeof functionError.name === 'string' ? functionError.name : 'UnknownFunctionError';
  const response = functionError.context as { status?: unknown } | undefined;
  const body = kind === 'FunctionsHttpError' ? await readFailureBody(functionError.context) : null;
  const status = typeof response?.status === 'number' ? response.status : 0;
  const rawCode = typeof body?.code === 'string' ? body.code : undefined;
  const stage = typeof body?.stage === 'string' ? body.stage : undefined;
  const retryable = typeof body?.retryable === 'boolean' ? body.retryable : undefined;
  const requestId = typeof body?.finalizeRequestId === 'string'
    ? body.finalizeRequestId
    : typeof body?.requestId === 'string'
      ? body.requestId
      : typeof body?.request_id === 'string'
        ? body.request_id
        : diagnostics?.finalizeRequestId;
  const message = typeof body?.message === 'string'
    ? body.message
    : typeof body?.error === 'string'
      ? body.error
      : typeof functionError.message === 'string'
        ? functionError.message
        : undefined;
  const code = rawCode
    ? finalizeErrorCode(rawCode)
    : mapFinalizeExceptionMessage(message);
  // Expand primitives so DevTools does not collapse to Object.
  console.error(
    '[finalize-couple-booth]',
    `requestId=${requestId ?? '-'}`,
    `status=${status}`,
    `code=${code}`,
    `stage=${stage ?? '-'}`,
    `message=${message ?? '-'}`,
    `retryable=${retryable ?? '-'}`,
    `sessionIdMasked=${diagnostics?.sessionIdMasked ?? '-'}`,
    `selectedShotCount=${diagnostics?.selectedShotCount ?? '-'}`,
    `kind=${kind}`,
  );
  return new BoothFinalizeError(
    status || httpStatusForFinalizeCode(code),
    code,
    requestId,
    message,
    stage,
    retryable,
  );
}
