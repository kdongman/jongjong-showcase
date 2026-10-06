import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBoothRemoteParticipant } from './remoteParticipant';

describe('resolveBoothRemoteParticipant', () => {
  it('matches the expected partner identity only', () => {
    const remotes = [{ identity: 'stranger' }, { identity: 'partner-id' }, { identity: 'other' }];
    assert.deepEqual(resolveBoothRemoteParticipant(remotes, 'partner-id'), { identity: 'partner-id' });
  });

  it('does not use the first remote when the partner is missing', () => {
    const remotes = [{ identity: 'stranger' }];
    assert.equal(resolveBoothRemoteParticipant(remotes, 'partner-id'), null);
    assert.equal(resolveBoothRemoteParticipant(remotes, null), null);
    assert.equal(resolveBoothRemoteParticipant(remotes, undefined), null);
    assert.equal(resolveBoothRemoteParticipant(remotes, ''), null);
  });

  it('resolves the correct partner when host/guest roles are swapped', () => {
    const remotesHostView = [{ identity: 'guest-user' }, { identity: 'noise' }];
    assert.deepEqual(resolveBoothRemoteParticipant(remotesHostView, 'guest-user'), { identity: 'guest-user' });
    const remotesGuestView = [{ identity: 'noise' }, { identity: 'host-user' }];
    assert.deepEqual(resolveBoothRemoteParticipant(remotesGuestView, 'host-user'), { identity: 'host-user' });
  });
});
