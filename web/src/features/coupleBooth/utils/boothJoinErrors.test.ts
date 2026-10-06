import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBoothJoinFailure } from './boothJoinErrors';
import { BoothTokenError } from '@shared/tokenError';

describe('boothJoinErrors', () => {
  it('classifies permission denial separately from room failure', () => {
    const result = classifyBoothJoinFailure({ mediaState: 'permission-denied', mediaErrorCode: 'permission-denied' });
    assert.equal(result.kind, 'permission');
  });

  it('classifies guest forbidden separately from generic errors', () => {
    const result = classifyBoothJoinFailure({
      tokenError: new BoothTokenError(403, 'NOT_SESSION_PARTICIPANT'),
    });
    assert.equal(result.kind, 'session_forbidden');
  });

  it('classifies token issuance failures without inventing a new session', () => {
    const result = classifyBoothJoinFailure({
      tokenError: new BoothTokenError(500, 'TOKEN_ISSUANCE_FAILED'),
    });
    assert.equal(result.kind, 'token_failed');
    assert.match(result.detail, /잠시 후/);
  });

  it('classifies auth session failures as re-login, not network', () => {
    const result = classifyBoothJoinFailure({
      tokenError: new BoothTokenError(401, 'AUTH_TOKEN_INVALID'),
    });
    assert.equal(result.kind, 'auth_required');
    assert.match(result.detail, /다시 로그인/);
    assert.equal(result.detail.includes('네트워크'), false);
  });

  it('classifies missing session as re-login', () => {
    const result = classifyBoothJoinFailure({
      tokenError: new BoothTokenError(401, 'AUTH_SESSION_MISSING'),
    });
    assert.equal(result.kind, 'auth_required');
  });

  it('classifies participant denial with permission copy', () => {
    const result = classifyBoothJoinFailure({
      tokenError: new BoothTokenError(403, 'NOT_SESSION_PARTICIPANT'),
    });
    assert.equal(result.kind, 'session_forbidden');
    assert.match(result.title, /권한/);
  });

  it('keeps segmentation-only failures from blocking capture copy', () => {
    const result = classifyBoothJoinFailure({ pageError: 'segmentation model failed' });
    assert.equal(result.kind, 'segmentation_only');
  });
});
