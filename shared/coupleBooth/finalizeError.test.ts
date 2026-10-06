import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boothFinalizeUserMessage,
  httpStatusForFinalizeCode,
  mapFinalizeExceptionMessage,
  toBoothFinalizeRequestError,
} from './finalizeError';

test('maps INVALID_MEMORY and INVALID_FINAL_PATH to 400-class codes', () => {
  assert.equal(mapFinalizeExceptionMessage('INVALID_MEMORY'), 'INVALID_MEMORY');
  assert.equal(mapFinalizeExceptionMessage('INVALID_FINAL_PATH'), 'INVALID_FINAL_PATH');
  assert.equal(httpStatusForFinalizeCode('INVALID_MEMORY'), 400);
  assert.equal(httpStatusForFinalizeCode('INVALID_FINAL_PATH'), 400);
});

test('does not treat domain finalize errors as opaque network copy', () => {
  assert.match(boothFinalizeUserMessage('INVALID_SELECTION_COUNT'), /4장/);
  assert.match(boothFinalizeUserMessage('SHOT_NOT_READY'), /준비하고/);
  assert.match(boothFinalizeUserMessage('RPC_SIGNATURE_MISMATCH'), /준비하지 못했어요/);
  assert.equal(boothFinalizeUserMessage('INTERNAL_FINALIZE_ERROR').includes('네트워크'), false);
  assert.match(boothFinalizeUserMessage('INTERNAL_FINALIZE_ERROR'), /다시 시도/);
});

test('maps claimed-by-other and selection conflicts to 409', () => {
  assert.equal(httpStatusForFinalizeCode('CLAIMED_BY_OTHER'), 409);
  assert.equal(httpStatusForFinalizeCode('SELECTION_CHANGED'), 409);
});

test('parses FunctionsHttpError body into requestId/code/stage', async () => {
  const body = {
    ok: false,
    requestId: 'edge-req-1',
    finalizeRequestId: 'c7b9d32a-400a-474d-b839-b0cc43b2ef2c',
    code: 'DATABASE_CONSTRAINT',
    stage: 'COMPLETE_RPC',
    message: 'column reference "event_type" is ambiguous',
    retryable: true,
  };
  const response = new Response(JSON.stringify(body), { status: 500 });
  const err = await toBoothFinalizeRequestError(
    { name: 'FunctionsHttpError', context: response, message: 'Edge Function returned a non-2xx status code' },
    { finalizeRequestId: 'c7b9d32a-400a-474d-b839-b0cc43b2ef2c', sessionIdMasked: 'fe2c…ec73', selectedShotCount: 4 },
  );
  assert.equal(err.code, 'DATABASE_CONSTRAINT');
  assert.equal(err.stage, 'COMPLETE_RPC');
  assert.equal(err.requestId, 'c7b9d32a-400a-474d-b839-b0cc43b2ef2c');
  assert.equal(err.retryable, true);
  assert.equal(err.status, 500);
  assert.match(err.messageText ?? '', /ambiguous/);
});
