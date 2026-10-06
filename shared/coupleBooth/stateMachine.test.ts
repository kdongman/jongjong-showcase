import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canIssueLiveKitToken, canTransition, isMediaActiveStatus, isTerminalStatus } from './stateMachine';

describe('couple booth state machine', () => {
  it('allows invite accept/decline/cancel/expire', () => {
    assert.equal(canTransition('invited', 'accepted'), true);
    assert.equal(canTransition('invited', 'declined'), true);
    assert.equal(canTransition('invited', 'capturing'), false);
  });

  it('moves through media then review to completed', () => {
    assert.equal(canTransition('accepted', 'connecting'), true);
    assert.equal(canTransition('ready', 'capturing'), true);
    assert.equal(canTransition('capturing', 'review'), true);
    assert.equal(canTransition('review', 'finalizing'), true);
    assert.equal(canTransition('finalizing', 'completed'), true);
    assert.equal(canTransition('completed', 'review'), false);
  });

  it('classifies media and terminal states', () => {
    assert.equal(isMediaActiveStatus('capturing'), true);
    assert.equal(canIssueLiveKitToken('ready'), true);
    assert.equal(canIssueLiveKitToken('review'), false);
    assert.equal(isTerminalStatus('expired'), true);
  });
});
