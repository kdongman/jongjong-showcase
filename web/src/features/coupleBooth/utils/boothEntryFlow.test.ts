import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BoothSession } from '@shared/types';
import {
  beginBoothEntrySingleFlight,
  boothHomeErrorMessage,
  isBoothSessionParticipant,
  resetBoothEntrySingleFlightForTests,
  resolveBoothEntrySession,
} from './boothEntryFlow';

function session(partial: Partial<BoothSession> & Pick<BoothSession, 'id' | 'hostUserId' | 'guestUserId' | 'status'>): BoothSession {
  return {
    coupleId: 'couple-1',
    livekitRoomName: 'booth_room',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    hostReady: false,
    guestReady: false,
    hostApproved: false,
    guestApproved: false,
    selectedShotIndexes: [],
    selectedFrameId: 'classic',
    selectedSlotCrops: {},
    sameSpaceEnabled: false,
    captureStartedAt: null,
    mediaExpiresAt: null,
    currentShotIndex: 0,
    currentCaptureId: null,
    currentCaptureAt: null,
    finalImagePath: null,
    errorReason: null,
    ...partial,
  };
}

const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_B = '22222222-2222-4222-8222-222222222222';

describe('boothEntryFlow', () => {
  it('maps couple errors without exposing raw codes as primary copy', () => {
    assert.match(boothHomeErrorMessage(new Error('couple_required')), /파트너/);
  });

  it('returns needs_couple when profile has no couple after refresh', async () => {
    const result = await resolveBoothEntrySession({
      userId: 'u1',
      coupleId: null,
      refreshProfile: async () => ({ coupleId: null }),
      getActiveSession: async () => null,
      getOrCreateSession: async () => {
        throw new Error('should not create');
      },
      acceptInvite: async () => {
        throw new Error('should not accept');
      },
    });
    assert.equal(result.kind, 'needs_couple');
  });

  it('joins existing active session for creator A / guest B without creating', async () => {
    let created = false;
    const existing = session({
      id: SESSION_A,
      hostUserId: 'user-a',
      guestUserId: 'user-b',
      status: 'invited',
    });
    const result = await resolveBoothEntrySession({
      userId: 'user-b',
      coupleId: 'c1',
      refreshProfile: async () => ({ coupleId: 'c1' }),
      getActiveSession: async () => existing,
      getOrCreateSession: async () => {
        created = true;
        return existing;
      },
      acceptInvite: async (sessionId) => session({
        id: sessionId,
        hostUserId: 'user-a',
        guestUserId: 'user-b',
        status: 'accepted',
      }),
    });
    assert.equal(created, false);
    assert.equal(result.kind, 'ready');
    if (result.kind === 'ready') {
      assert.equal(result.session.status, 'accepted');
      assert.equal(result.created, false);
      assert.equal(isBoothSessionParticipant(result.session, 'user-b'), true);
    }
  });

  it('joins existing active session for creator B / guest A without creating', async () => {
    let created = false;
    const existing = session({
      id: SESSION_B,
      hostUserId: 'user-b',
      guestUserId: 'user-a',
      status: 'invited',
    });
    const result = await resolveBoothEntrySession({
      userId: 'user-a',
      coupleId: 'c1',
      refreshProfile: async () => ({ coupleId: 'c1' }),
      getActiveSession: async () => existing,
      getOrCreateSession: async () => {
        created = true;
        return existing;
      },
      acceptInvite: async (sessionId) => session({
        id: sessionId,
        hostUserId: 'user-b',
        guestUserId: 'user-a',
        status: 'accepted',
      }),
    });
    assert.equal(created, false);
    assert.equal(result.kind, 'ready');
    if (result.kind === 'ready') {
      assert.equal(result.session.hostUserId, 'user-b');
      assert.equal(result.session.guestUserId, 'user-a');
    }
  });

  it('does not create a new session when guest accept fails', async () => {
    let createCalls = 0;
    const result = await resolveBoothEntrySession({
      userId: 'user-b',
      coupleId: 'c1',
      refreshProfile: async () => ({ coupleId: 'c1' }),
      getActiveSession: async () => session({
        id: SESSION_A,
        hostUserId: 'user-a',
        guestUserId: 'user-b',
        status: 'invited',
      }),
      getOrCreateSession: async () => {
        createCalls += 1;
        throw new Error('should not create after accept failure');
      },
      acceptInvite: async () => {
        throw new Error('ONLY_GUEST_CAN_ACCEPT');
      },
    });
    assert.equal(createCalls, 0);
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.equal(result.code, 'ACCEPT_FAILED');
    }
  });

  it('rejects non-participant sessions without creating a split room', async () => {
    const result = await resolveBoothEntrySession({
      userId: 'outsider',
      coupleId: 'c1',
      refreshProfile: async () => ({ coupleId: 'c1' }),
      getActiveSession: async () => session({
        id: SESSION_A,
        hostUserId: 'user-a',
        guestUserId: 'user-b',
        status: 'accepted',
      }),
      getOrCreateSession: async () => {
        throw new Error('should not create');
      },
      acceptInvite: async () => {
        throw new Error('should not accept');
      },
    });
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.equal(result.code, 'NOT_SESSION_PARTICIPANT');
    }
  });

  it('rejects null session ids from get-or-create', async () => {
    const result = await resolveBoothEntrySession({
      userId: 'u1',
      coupleId: 'c1',
      refreshProfile: async () => ({ coupleId: 'c1' }),
      getActiveSession: async () => null,
      getOrCreateSession: async () => session({
        id: null as unknown as string,
        hostUserId: 'u1',
        guestUserId: 'u2',
        status: 'invited',
      }),
      acceptInvite: async () => {
        throw new Error('should not accept');
      },
    });
    assert.equal(result.kind, 'error');
  });

  it('creates only when no active participant session exists', async () => {
    let createCalls = 0;
    const result = await resolveBoothEntrySession({
      userId: 'user-a',
      coupleId: 'c1',
      refreshProfile: async () => ({ coupleId: 'c1' }),
      getActiveSession: async () => null,
      getOrCreateSession: async () => {
        createCalls += 1;
        return session({
          id: SESSION_A,
          hostUserId: 'user-a',
          guestUserId: 'user-b',
          status: 'invited',
        });
      },
      acceptInvite: async () => {
        throw new Error('host should not accept');
      },
    });
    assert.equal(createCalls, 1);
    assert.equal(result.kind, 'ready');
    if (result.kind === 'ready') assert.equal(result.created, true);
  });

  it('shares one in-flight entry promise per user (StrictMode)', async () => {
    resetBoothEntrySingleFlightForTests();
    let runs = 0;
    const run = () => beginBoothEntrySingleFlight('user-a', async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        kind: 'ready' as const,
        created: false,
        session: session({
          id: SESSION_B,
          hostUserId: 'user-a',
          guestUserId: 'user-b',
          status: 'invited',
        }),
      };
    });
    const [a, b] = await Promise.all([run(), run()]);
    assert.equal(runs, 1);
    assert.equal(a.kind, 'ready');
    assert.equal(b.kind, 'ready');
    resetBoothEntrySingleFlightForTests();
  });
});
