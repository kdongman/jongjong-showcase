import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBoothPositionError } from './boothPositionErrors';

describe('classifyBoothPositionError', () => {
  it('maps PostgREST missing-function to RPC_NOT_DEPLOYED', () => {
    const result = classifyBoothPositionError({
      code: 'PGRST202',
      message: 'Could not find the function public.set_couple_booth_positions',
      status: 404,
    });
    assert.equal(result.code, 'RPC_NOT_DEPLOYED');
    assert.match(result.userMessage, /자리 설정을 저장하지 못했어요/);
    assert.doesNotMatch(result.userMessage, /POSITION_SAVE_FAILED/);
  });

  it('maps revision conflicts without raw codes in user copy', () => {
    const result = classifyBoothPositionError(new Error('POSITION_REVISION_CONFLICT'));
    assert.equal(result.code, 'REVISION_CONFLICT');
    assert.doesNotMatch(result.userMessage, /POSITION_REVISION_CONFLICT/);
  });
});
