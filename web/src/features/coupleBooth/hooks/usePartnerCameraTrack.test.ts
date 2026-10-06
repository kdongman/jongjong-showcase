import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPartnerCameraTrack } from '@shared/partnerCameraTrack';

describe('usePartnerCameraTrack matching policy', () => {
  it('requires partner identity + camera video', () => {
    assert.equal(
      isPartnerCameraTrack({
        expectedParticipantId: 'partner-1',
        participantIdentity: 'partner-1',
        source: 'camera',
        kind: 'video',
      }),
      true,
    );
  });

  it('rejects the first-remote shortcut cases', () => {
    assert.equal(
      isPartnerCameraTrack({
        expectedParticipantId: 'partner-1',
        participantIdentity: 'someone-else',
        source: 'camera',
        kind: 'video',
      }),
      false,
    );
    assert.equal(
      isPartnerCameraTrack({
        expectedParticipantId: 'partner-1',
        participantIdentity: 'partner-1',
        source: 'screen_share',
        kind: 'video',
      }),
      false,
    );
  });
});
