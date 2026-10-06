import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BoothSession } from '@shared/types';
import {
  beginAcceptBoothInviteSingleFlight,
  resetAcceptBoothInviteSingleFlightForTests,
} from './boothAcceptInvite';

describe('boothAcceptInvite single-flight', () => {
  it('shares one accept RPC across StrictMode double invoke', async () => {
    resetAcceptBoothInviteSingleFlightForTests();
    let calls = 0;
    const sessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const accept = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { id: sessionId, status: 'accepted' } as BoothSession;
    };
    const [a, b] = await Promise.all([
      beginAcceptBoothInviteSingleFlight(sessionId, accept),
      beginAcceptBoothInviteSingleFlight(sessionId, accept),
    ]);
    assert.equal(calls, 1);
    assert.equal(a.status, 'accepted');
    assert.equal(b.status, 'accepted');
    resetAcceptBoothInviteSingleFlightForTests();
  });
});
