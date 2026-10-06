import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsPreflightResponse, jsonResponse } from '../_shared/cors.ts';

/**
 * Atomic finalize endpoint (authoritative path for browsers):
 * 1) claim finalization
 * 2) verify final path belongs to couple/session
 * 3) complete session + memory link
 *
 * Clients must not call complete_couple_booth_session directly.
 * Image composition happens client-side before this function is invoked.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUILD_ID = Deno.env.get('COUPLE_BOOTH_FINALIZE_BUILD_ID') ?? 'finalize-v7';

type FinalizeStage =
  | 'AUTH'
  | 'VALIDATE_REQUEST'
  | 'CLAIM'
  | 'LOAD_SESSION'
  | 'VALIDATE_FINAL_PATH'
  | 'VALIDATE_MEMORY'
  | 'COMPLETE_RPC'
  | 'OK';

function mapRpcMessage(message: string | undefined): { code: string; status: number; retryable: boolean } {
  const text = (message ?? '').toUpperCase();
  if (text.includes('PGRST202') || text.includes('COULD NOT FIND THE FUNCTION')) {
    return { code: 'RPC_SIGNATURE_MISMATCH', status: 500, retryable: false };
  }
  if (text.includes('42702') || text.includes('AMBIGUOUS')) {
    return { code: 'DATABASE_CONSTRAINT', status: 500, retryable: true };
  }
  if (text.includes('INVALID_MEMORY')) return { code: 'INVALID_MEMORY', status: 400, retryable: false };
  if (text.includes('INVALID_FINAL_PATH')) return { code: 'INVALID_FINAL_PATH', status: 400, retryable: false };
  if (text.includes('FINALIZATION_NOT_OWNED')) return { code: 'FINALIZATION_NOT_OWNED', status: 409, retryable: true };
  if (text.includes('SELECTION_CHANGED')) return { code: 'SELECTION_CHANGED', status: 409, retryable: false };
  if (text.includes('HOST_APPROVAL')) return { code: 'HOST_APPROVAL_REQUIRED', status: 409, retryable: false };
  if (text.includes('GUEST_APPROVAL')) return { code: 'GUEST_APPROVAL_REQUIRED', status: 409, retryable: false };
  if (text.includes('INVALID_STATUS')) return { code: 'INVALID_SESSION_STATE', status: 409, retryable: false };
  if (text.includes('NOT_PARTICIPANT') || text.includes('NOT_COUPLE')) {
    return { code: 'NOT_SESSION_PARTICIPANT', status: 403, retryable: false };
  }
  if (text.includes('NOT_AUTHENTICATED')) return { code: 'UNAUTHORIZED', status: 401, retryable: false };
  if (text.includes('SESSION_NOT_FOUND')) return { code: 'INVALID_SESSION_STATE', status: 404, retryable: false };
  if (text.includes('UNIQUE') || text.includes('CONSTRAINT') || text.includes('23505')) {
    return { code: 'DATABASE_CONSTRAINT', status: 500, retryable: true };
  }
  return { code: 'INTERNAL_FINALIZE_ERROR', status: 500, retryable: true };
}

function logStage(input: {
  requestId: string;
  finalizeRequestId: string;
  stage: FinalizeStage;
  code?: string;
  durationMs?: number;
  authUserId?: string;
  boothSessionId?: string;
  message?: string;
  retryable?: boolean;
}) {
  const payload = {
    finalizeRequestId: input.finalizeRequestId,
    requestId: input.requestId,
    stage: input.stage,
    code: input.code ?? 'OK',
    durationMs: input.durationMs ?? 0,
    authUserId: input.authUserId,
    boothSessionId: input.boothSessionId,
    message: input.message,
    retryable: input.retryable,
    functionBuildId: BUILD_ID,
  };
  if (input.code && input.code !== 'OK' && input.code !== 'ALREADY_FINALIZED') {
    console.error('[finalize-couple-booth]', payload);
  } else {
    console.info('[finalize-couple-booth]', payload);
  }
}

function failureResponse(
  request: Request,
  input: {
    requestId: string;
    finalizeRequestId: string;
    stage: FinalizeStage;
    code: string;
    message: string;
    status: number;
    retryable: boolean;
    authUserId?: string;
    boothSessionId?: string;
    durationMs?: number;
  },
) {
  logStage({
    requestId: input.requestId,
    finalizeRequestId: input.finalizeRequestId,
    stage: input.stage,
    code: input.code,
    durationMs: input.durationMs,
    authUserId: input.authUserId,
    boothSessionId: input.boothSessionId,
    message: input.message,
    retryable: input.retryable,
  });
  return jsonResponse(request, {
    ok: false,
    requestId: input.requestId,
    finalizeRequestId: input.finalizeRequestId,
    code: input.code,
    stage: input.stage,
    message: input.message,
    retryable: input.retryable,
    request_id: input.requestId,
    error: input.message,
  }, input.status);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return corsPreflightResponse(request);

  const requestId = crypto.randomUUID();
  let finalizeRequestId = requestId;
  let stage: FinalizeStage = 'AUTH';
  let authUserId: string | undefined;
  let boothSessionId: string | undefined;
  const started = performance.now();

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.trim() || !/^Bearer\s+\S+/i.test(authorization)) {
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'AUTH',
        code: 'UNAUTHORIZED',
        message: 'Authorization bearer is required.',
        status: 401,
        retryable: false,
        durationMs: Math.round(performance.now() - started),
      });
    }

    // Parse body early so client finalizeRequestId is present on AUTH failures too.
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    finalizeRequestId = typeof body.finalizeRequestId === 'string' && body.finalizeRequestId
      ? body.finalizeRequestId
      : requestId;

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    if (authError || !user) {
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'AUTH',
        code: 'UNAUTHORIZED',
        message: 'Auth token is invalid or expired.',
        status: 401,
        retryable: false,
        durationMs: Math.round(performance.now() - started),
      });
    }
    authUserId = user.id;

    stage = 'VALIDATE_REQUEST';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
    boothSessionId = sessionId || undefined;
    const finalImagePath = typeof body.finalImagePath === 'string' ? body.finalImagePath : '';
    const memoryId = typeof body.memoryId === 'string' && UUID_PATTERN.test(body.memoryId)
      ? body.memoryId
      : null;
    const selected = Array.isArray(body.selectedShotIndexes)
      ? body.selectedShotIndexes.map((value: unknown) => Number(value))
      : [];
    const allowHostSolo = Boolean(body.allowHostSolo);

    logStage({
      requestId,
      finalizeRequestId,
      stage: 'VALIDATE_REQUEST',
      authUserId,
      boothSessionId,
      durationMs: Math.round(performance.now() - started),
    });

    if (!UUID_PATTERN.test(sessionId) || !finalImagePath) {
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'VALIDATE_REQUEST',
        code: 'INVALID_PAYLOAD',
        message: 'sessionId and finalImagePath are required.',
        status: 400,
        retryable: false,
        authUserId,
        boothSessionId,
        durationMs: Math.round(performance.now() - started),
      });
    }
    if (selected.length !== 4 || selected.some((value) => !Number.isInteger(value))) {
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'VALIDATE_REQUEST',
        code: 'INVALID_SELECTION_COUNT',
        message: 'Exactly four selected shot indexes are required.',
        status: 400,
        retryable: false,
        authUserId,
        boothSessionId,
        durationMs: Math.round(performance.now() - started),
      });
    }

    stage = 'CLAIM';
    const claimStarted = performance.now();
    const { data: claimed, error: claimError } = await client.rpc('claim_couple_booth_finalization', {
      target_session: sessionId,
      selected,
      allow_host_solo: allowHostSolo,
    });
    if (claimError) {
      const mapped = mapRpcMessage(claimError.message);
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'CLAIM',
        code: mapped.code,
        message: claimError.message,
        status: mapped.status,
        retryable: mapped.retryable,
        authUserId,
        boothSessionId,
        durationMs: Math.round(performance.now() - claimStarted),
      });
    }

    stage = 'LOAD_SESSION';
    // Idempotent: already completed.
    if (claimed?.status === 'completed' && claimed.final_image_path) {
      logStage({
        requestId,
        finalizeRequestId,
        stage: 'OK',
        code: 'ALREADY_FINALIZED',
        authUserId,
        boothSessionId,
        durationMs: Math.round(performance.now() - started),
      });
      return jsonResponse(request, {
        ok: true,
        session: claimed,
        recovered: true,
        code: 'ALREADY_FINALIZED',
        stage: 'OK',
        requestId,
        finalizeRequestId,
        request_id: requestId,
      });
    }

    if (
      claimed?.finalizing_claimed_by
      && claimed.finalizing_claimed_by !== user.id
      && claimed.status === 'finalizing'
    ) {
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'CLAIM',
        code: 'CLAIMED_BY_OTHER',
        message: 'Another participant is finalizing.',
        status: 409,
        retryable: true,
        authUserId,
        boothSessionId,
        durationMs: Math.round(performance.now() - started),
      });
    }

    stage = 'VALIDATE_FINAL_PATH';
    const coupleId = String(claimed?.couple_id ?? '');
    const expectedPath = `${coupleId}/${sessionId}/final.jpg`;
    if (!coupleId || finalImagePath !== expectedPath) {
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'VALIDATE_FINAL_PATH',
        code: 'INVALID_FINAL_PATH',
        message: 'Final image path must match couple/session contract.',
        status: 400,
        retryable: false,
        authUserId,
        boothSessionId,
        durationMs: Math.round(performance.now() - started),
      });
    }

    stage = 'VALIDATE_MEMORY';
    const sessionMemory = typeof claimed?.memory_id === 'string' ? claimed.memory_id : null;
    const memoryToUse = sessionMemory ?? memoryId;
    if (!memoryToUse) {
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'VALIDATE_MEMORY',
        code: 'INVALID_MEMORY',
        message: 'Booth memory has not been created yet.',
        status: 400,
        retryable: true,
        authUserId,
        boothSessionId,
        durationMs: Math.round(performance.now() - started),
      });
    }
    if (memoryId && sessionMemory && memoryId !== sessionMemory) {
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'VALIDATE_MEMORY',
        code: 'INVALID_MEMORY',
        message: 'Memory id does not match the session memory.',
        status: 400,
        retryable: false,
        authUserId,
        boothSessionId,
        durationMs: Math.round(performance.now() - started),
      });
    }

    stage = 'COMPLETE_RPC';
    const completeStarted = performance.now();
    const { data: completed, error: completeError } = await client.rpc('complete_couple_booth_session', {
      target_session: sessionId,
      final_path: finalImagePath,
      memory: memoryToUse,
    });
    if (completeError) {
      const mapped = mapRpcMessage(completeError.message);
      return failureResponse(request, {
        requestId,
        finalizeRequestId,
        stage: 'COMPLETE_RPC',
        code: mapped.code,
        message: completeError.message,
        status: mapped.status,
        retryable: mapped.retryable,
        authUserId,
        boothSessionId,
        durationMs: Math.round(performance.now() - completeStarted),
      });
    }

    logStage({
      requestId,
      finalizeRequestId,
      stage: 'OK',
      code: 'OK',
      authUserId,
      boothSessionId,
      durationMs: Math.round(performance.now() - started),
    });
    return jsonResponse(request, {
      ok: true,
      session: completed,
      code: 'OK',
      stage: 'OK',
      requestId,
      finalizeRequestId,
      request_id: requestId,
    });
  } catch (error) {
    return failureResponse(request, {
      requestId,
      finalizeRequestId,
      stage,
      code: 'INTERNAL_FINALIZE_ERROR',
      message: error instanceof Error ? error.message : 'Finalize failed.',
      status: 500,
      retryable: true,
      authUserId,
      boothSessionId,
      durationMs: Math.round(performance.now() - started),
    });
  }
});
