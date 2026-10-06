/** Classify Same Space position RPC failures without leaking raw codes to main UI. */

export type BoothPositionErrorCode =
  | 'RPC_NOT_DEPLOYED'
  | 'RPC_SIGNATURE_MISMATCH'
  | 'REVISION_CONFLICT'
  | 'NOT_PARTICIPANT'
  | 'INVALID_POSITION'
  | 'POSITION_SAVE_FAILED';

export type ClassifiedBoothPositionError = {
  code: BoothPositionErrorCode;
  /** Safe copy for the main session UI. */
  userMessage: string;
  /** Raw signal for DEV HUD / logs only. */
  rawMessage: string;
};

const USER_POSITION_SAVE =
  '자리 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';

function readErrorBlob(error: unknown): { message: string; code: string; status: number | null } {
  if (!error || typeof error !== 'object') {
    return { message: String(error ?? ''), code: '', status: null };
  }
  const row = error as Record<string, unknown>;
  const message = String(row.message ?? (error instanceof Error ? error.message : '') ?? '');
  const code = String(row.code ?? '');
  const status = typeof row.status === 'number'
    ? row.status
    : typeof row.statusCode === 'number'
      ? row.statusCode
      : null;
  return { message, code, status };
}

export function classifyBoothPositionError(error: unknown): ClassifiedBoothPositionError {
  const { message, code, status } = readErrorBlob(error);
  const blob = `${code} ${message}`.toLowerCase();

  if (
    status === 404
    || code === 'PGRST202'
    || code === 'PGRST204'
    || /could not find the function|schema cache|404|does not exist|not find.*rpc/i.test(blob)
  ) {
    const signature = /wrong|argument|function.*with|pgrst203/i.test(blob);
    return {
      code: signature ? 'RPC_SIGNATURE_MISMATCH' : 'RPC_NOT_DEPLOYED',
      userMessage: USER_POSITION_SAVE,
      rawMessage: message || code || 'RPC_NOT_DEPLOYED',
    };
  }

  if (/position_revision_conflict|revision.?conflict/i.test(blob)) {
    return {
      code: 'REVISION_CONFLICT',
      userMessage: '상대가 자리를 바꿨어요. 최신 상태를 불러왔어요.',
      rawMessage: message || 'POSITION_REVISION_CONFLICT',
    };
  }

  if (/not_participant|not_couple_member|transform_owner/i.test(blob)) {
    return {
      code: 'NOT_PARTICIPANT',
      userMessage: USER_POSITION_SAVE,
      rawMessage: message || 'NOT_PARTICIPANT',
    };
  }

  if (/invalid_position/i.test(blob)) {
    return {
      code: 'INVALID_POSITION',
      userMessage: USER_POSITION_SAVE,
      rawMessage: message || 'INVALID_POSITION',
    };
  }

  return {
    code: 'POSITION_SAVE_FAILED',
    userMessage: USER_POSITION_SAVE,
    rawMessage: message || 'POSITION_SAVE_FAILED',
  };
}
