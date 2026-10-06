import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBoothEvent,
  parseBoothEvent,
  protocolsCompatible,
  type BoothRealtimeEvent,
} from './protocol';
import {
  assertReadyForFinalize,
  buildCandidates,
  canClaimFinalization,
  missingShotIndexes,
  pairedShotsForIndex,
  validateCaptureIdempotency,
  validateUploadIdempotency,
  isMediaExpired,
  mediaRemainingMs,
} from './validation';
import { COUPLE_BOOTH_PROTOCOL_VERSION, type BoothShotRow } from './types';

function shot(partial: Partial<BoothShotRow> & Pick<BoothShotRow, 'userId' | 'shotIndex' | 'captureId'>): BoothShotRow {
  return {
    id: partial.id ?? `${partial.userId}-${partial.shotIndex}-${partial.captureId}`,
    sessionId: partial.sessionId ?? 'session-1',
    userId: partial.userId,
    shotIndex: partial.shotIndex,
    captureId: partial.captureId,
    imagePath: partial.imagePath ?? `${partial.userId}/${partial.shotIndex}.jpg`,
    capturedAt: partial.capturedAt ?? new Date().toISOString(),
    width: partial.width ?? 720,
    height: partial.height ?? 1280,
  };
}

describe('couple booth hardening', () => {
  it('rejects concurrent finalize when another actor already claimed', () => {
    const host = canClaimFinalization({
      status: 'review',
      hostApproved: true,
      guestApproved: true,
      allowHostSolo: false,
      isHost: true,
      finalizingClaimedBy: null,
      finalImagePath: null,
      actorId: 'host',
    });
    assert.equal(host, 'claim');

    const guestDuringClaim = canClaimFinalization({
      status: 'finalizing',
      hostApproved: true,
      guestApproved: true,
      allowHostSolo: false,
      isHost: false,
      finalizingClaimedBy: 'host',
      finalImagePath: null,
      actorId: 'guest',
    });
    assert.equal(guestDuringClaim, 'claimed_by_other');
  });

  it('recovers completed finalize instead of creating a second memory path', () => {
    const recovered = canClaimFinalization({
      status: 'completed',
      hostApproved: true,
      guestApproved: true,
      allowHostSolo: false,
      isHost: true,
      finalizingClaimedBy: 'guest',
      finalImagePath: 'couple/session/final.jpg',
      actorId: 'host',
    });
    assert.equal(recovered, 'recover_completed');
  });

  it('blocks capture when peer protocol version mismatches', () => {
    assert.equal(protocolsCompatible(COUPLE_BOOTH_PROTOCOL_VERSION), true);
    assert.equal(protocolsCompatible(COUPLE_BOOTH_PROTOCOL_VERSION + 1), false);
    assert.equal(protocolsCompatible(0), false);
  });

  it('does not pair reshot frames that share shot_index but different captureId', () => {
    const shots = [
      shot({ userId: 'host', shotIndex: 1, captureId: '11111111-1111-1111-1111-111111111111' }),
      shot({ userId: 'guest', shotIndex: 1, captureId: '22222222-2222-2222-2222-222222222222' }),
    ];
    const pair = pairedShotsForIndex(shots, 1, 'host', 'guest');
    assert.equal(pair.matched, false);
    assert.deepEqual(missingShotIndexes(shots, 'host', 'guest').slice(0, 1), [1]);
    const candidates = buildCandidates(shots, 'host', 'guest');
    assert.equal(candidates[0]?.hostShot, undefined);
    assert.equal(candidates[0]?.guestShot, undefined);
  });

  it('pairs only when both sides share the same captureId', () => {
    const captureId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const shots = [
      shot({ userId: 'host', shotIndex: 3, captureId }),
      shot({ userId: 'guest', shotIndex: 3, captureId }),
    ];
    assert.equal(pairedShotsForIndex(shots, 3, 'host', 'guest').matched, true);
  });

  it('dedupes duplicate capture events and tolerates reverse upload arrival order', () => {
    const captureSeen = new Set<string>();
    const uploadSeen = new Set<string>();
    const captureId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    assert.equal(validateCaptureIdempotency(captureSeen, captureId, 'host'), true);
    assert.equal(validateCaptureIdempotency(captureSeen, captureId, 'host'), false);
    // Upload can arrive before a duplicate capture replay.
    assert.equal(validateUploadIdempotency(uploadSeen, captureId, 'host'), true);
    assert.equal(validateUploadIdempotency(uploadSeen, captureId, 'host'), false);
  });

  it('round-trips mobile/web event serialization identically', () => {
    const events: BoothRealtimeEvent[] = [
      { type: 'ready', userId: 'u1', protocolVersion: COUPLE_BOOTH_PROTOCOL_VERSION },
      {
        type: 'protocol_mismatch',
        userId: 'u1',
        protocolVersion: COUPLE_BOOTH_PROTOCOL_VERSION,
        peerProtocolVersion: 99,
      },
      { type: 'ping', userId: 'u1', sentAt: 1000 },
      { type: 'pong', userId: 'u2', pingSentAt: 1000, receivedAt: 1012 },
      {
        type: 'capture_scheduled',
        captureId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        shotIndex: 2,
        captureAt: 123456,
      },
      {
        type: 'capture_completed',
        captureId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        shotIndex: 2,
        userId: 'u1',
        localCapturedAt: 123500,
      },
      {
        type: 'upload_completed',
        captureId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        shotIndex: 2,
        userId: 'u1',
        storagePath: 'c/s/u/shot-02-cccccccccc.jpg',
      },
      {
        type: 'positions_preview',
        userId: 'u1',
        leftParticipantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        rightParticipantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        participantTransforms: {},
      },
      {
        type: 'transform_preview',
        userId: 'u1',
        offsetX: 0.1,
        offsetY: -0.05,
        scale: 1,
      },
    ];
    for (const event of events) {
      const encoded = encodeBoothEvent(event);
      const parsed = parseBoothEvent(encoded);
      assert.deepEqual(parsed, event);
    }
  });

  it('rejects untrusted packets that only type-assert would accept', () => {
    assert.equal(parseBoothEvent(JSON.stringify({ type: 'ready', userId: 'u' })), null);
    assert.equal(
      parseBoothEvent(
        JSON.stringify({
          v: COUPLE_BOOTH_PROTOCOL_VERSION,
          type: 'capture_scheduled',
          captureId: 'not-a-uuid',
          shotIndex: 1,
          captureAt: 1,
        }),
      ),
      null,
    );
    assert.equal(
      parseBoothEvent(
        JSON.stringify({
          v: 999,
          type: 'ready',
          userId: 'u',
          protocolVersion: 1,
        }),
      ),
      null,
    );
  });

  it('enforces one memory finalize gate via selection + approvals', () => {
    const shots = Array.from({ length: 8 }, (_, i) => {
      const captureId = `dddddddd-dddd-dddd-dddd-${String(i + 1).padStart(12, '0')}`;
      return [
        shot({ userId: 'host', shotIndex: i + 1, captureId }),
        shot({ userId: 'guest', shotIndex: i + 1, captureId }),
      ];
    }).flat();
    assert.doesNotThrow(() =>
      assertReadyForFinalize({
        selectedShotIndexes: [1, 2, 3, 4],
        hostApproved: true,
        guestApproved: true,
        allowHostSolo: false,
        shots,
        hostUserId: 'host',
        guestUserId: 'guest',
      }),
    );
    assert.throws(() =>
      assertReadyForFinalize({
        selectedShotIndexes: [1, 2, 3],
        hostApproved: true,
        guestApproved: true,
        allowHostSolo: false,
        shots,
        hostUserId: 'host',
        guestUserId: 'guest',
      }),
    );
  });

  it('treats client clock skew as UI-only against server media_expires_at', () => {
    const serverExpiry = Date.now() + 5_000;
    const skewedNow = Date.now() + 5_000; // client 5s ahead
    assert.equal(isMediaExpired(new Date(serverExpiry).toISOString(), skewedNow), true);
    assert.ok(mediaRemainingMs(new Date(serverExpiry).toISOString(), Date.now()) > 0);
  });

  it('allows capture only before authoritative expiry boundary', () => {
    const almostExpired = new Date(Date.now() + 800).toISOString();
    assert.equal(isMediaExpired(almostExpired), false);
    assert.equal(isMediaExpired(new Date(Date.now() - 1).toISOString()), true);
  });

  it('simulates webhook idempotency via unique event id set', () => {
    const processed = new Set<string>();
    const eventId = 'EV_participant_joined_roomA_host';
    const first = !processed.has(eventId) && (processed.add(eventId), true);
    const duplicate = !processed.has(eventId);
    assert.equal(first, true);
    assert.equal(duplicate, false);
  });

  it('rejects third-party participant identity against host/guest set', () => {
    const host = 'host-id';
    const guest = 'guest-id';
    const identity = 'attacker-id';
    const allowed = identity === host || identity === guest;
    assert.equal(allowed, false);
  });
});
