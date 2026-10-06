import assert from 'node:assert/strict';
import test from 'node:test';
import { BoothTokenError, toBoothTokenRequestError } from './tokenError';

test('preserves SESSION_EXPIRED from an Edge Function response as a structured error', async () => {
  const error = await toBoothTokenRequestError({
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify({
      code: 'SESSION_EXPIRED',
      phase: 'validate_session',
      request_id: 'request-id',
    }), { status: 409 }),
  });

  assert.ok(error instanceof BoothTokenError);
  assert.equal(error.status, 409);
  assert.equal(error.code, 'SESSION_EXPIRED');
  assert.equal(error.phase, 'validate_session');
  assert.equal(error.requestId, 'request-id');
});

test('maps missing Authorization to AUTH_SESSION_MISSING', async () => {
  const error = await toBoothTokenRequestError({
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify({
      code: 'AUTH_SESSION_MISSING',
      message: 'Authorization bearer is required.',
      request_id: 'r1',
    }), { status: 401 }),
  });
  assert.equal(error.code, 'AUTH_SESSION_MISSING');
  assert.equal(error.status, 401);
  assert.equal(error.messageText, 'Authorization bearer is required.');
});

test('normalizes legacy UNAUTHORIZED 401 to AUTH_TOKEN_INVALID', async () => {
  const error = await toBoothTokenRequestError({
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify({
      code: 'UNAUTHORIZED',
      request_id: 'r2',
    }), { status: 401 }),
  });
  assert.equal(error.code, 'AUTH_TOKEN_INVALID');
});

test('maps LIVEKIT_CONFIG_MISSING to TOKEN_CONFIG_ERROR', async () => {
  const error = await toBoothTokenRequestError({
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify({
      code: 'LIVEKIT_CONFIG_MISSING',
      request_id: 'r3',
    }), { status: 500 }),
  });
  assert.equal(error.code, 'TOKEN_CONFIG_ERROR');
});
