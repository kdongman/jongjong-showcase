import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSameSpaceStageLayout,
  partnerUserIdForLocal,
  roleForUserId,
  sameSpaceRectStyle,
} from './sameSpaceStageLayout';
import { isPartnerCameraTrack, shouldIgnoreTrack } from './partnerCameraTrack';

describe('sameSpaceStageLayout', () => {
  it('uses exact 50:50 home regions for left and right', () => {
    const layout = computeSameSpaceStageLayout();
    assert.deepEqual(layout.left, { x: 0, y: 0, width: 0.5, height: 1 });
    assert.deepEqual(layout.right, { x: 0.5, y: 0, width: 0.5, height: 1 });
    assert.deepEqual(layout.host, layout.left);
    assert.deepEqual(layout.guest, layout.right);
    assert.deepEqual(sameSpaceRectStyle(layout.left), {
      left: '0%',
      top: '0%',
      width: '50%',
      height: '100%',
    });
  });

  it('resolves partner and role by user id', () => {
    assert.equal(partnerUserIdForLocal('host', 'host', 'guest'), 'guest');
    assert.equal(partnerUserIdForLocal('guest', 'host', 'guest'), 'host');
    assert.equal(partnerUserIdForLocal('other', 'host', 'guest'), null);
    assert.equal(roleForUserId('host', 'host', 'guest'), 'host');
    assert.equal(roleForUserId('guest', 'host', 'guest'), 'guest');
  });
});

describe('partnerCameraTrack', () => {
  it('accepts only the expected remote camera video track', () => {
    assert.equal(
      isPartnerCameraTrack({
        expectedParticipantId: 'guest-id',
        participantIdentity: 'guest-id',
        source: 'camera',
        kind: 'video',
      }),
      true,
    );
  });

  it('ignores audio, screen share, local, and wrong participant tracks', () => {
    assert.equal(
      shouldIgnoreTrack({
        expectedParticipantId: 'guest-id',
        participantIdentity: 'guest-id',
        source: 'microphone',
        kind: 'audio',
      }),
      true,
    );
    assert.equal(
      shouldIgnoreTrack({
        expectedParticipantId: 'guest-id',
        participantIdentity: 'guest-id',
        source: 'screen_share',
        kind: 'video',
      }),
      true,
    );
    assert.equal(
      shouldIgnoreTrack({
        expectedParticipantId: 'guest-id',
        participantIdentity: 'host-id',
        source: 'camera',
        kind: 'video',
      }),
      true,
    );
    assert.equal(
      shouldIgnoreTrack({
        expectedParticipantId: 'guest-id',
        participantIdentity: 'guest-id',
        source: 'camera',
        kind: 'video',
        isLocal: true,
      }),
      true,
    );
  });
});
