import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideSourceRecovery, ENQUEUE_STALE_MS, SEGMENT_STALE_MS } from './sourceLivenessHeartbeat';

describe('sourceLivenessHeartbeat', () => {
  it('rearms when currentTime advances but enqueue is stale', () => {
    const action = decideSourceRecovery({
      sourceId: 'remote',
      videoCurrentTime: 4,
      previousCurrentTime: 3.5,
      lastEnqueueAtMs: 0,
      lastSegmentSuccessAtMs: 10,
      lastCommitAtMs: 10,
      lastDrawnAtMs: 10,
      commitVersion: 2,
      drawnVersion: 2,
      contentRevision: 2,
      trackReadyState: 'live',
      attached: true,
      nowMs: ENQUEUE_STALE_MS + 20,
    });
    assert.equal(action.type, 'rearm-and-enqueue');
  });

  it('recovers scheduler when enqueue is fresh but segmentation is stale', () => {
    const now = SEGMENT_STALE_MS + 100;
    const action = decideSourceRecovery({
      sourceId: 'remote',
      videoCurrentTime: 1,
      previousCurrentTime: 1,
      lastEnqueueAtMs: now - 100,
      lastSegmentSuccessAtMs: 0,
      lastCommitAtMs: 0,
      lastDrawnAtMs: 0,
      commitVersion: 0,
      drawnVersion: 0,
      contentRevision: 0,
      trackReadyState: 'live',
      attached: true,
      nowMs: now,
    });
    assert.equal(action.type, 'recover-scheduler');
  });

  it('does not restart sibling sources — decisions are per-source only', () => {
    const action = decideSourceRecovery({
      sourceId: 'remote',
      videoCurrentTime: 1,
      previousCurrentTime: 1.2,
      lastEnqueueAtMs: 1000,
      lastSegmentSuccessAtMs: 1000,
      lastCommitAtMs: 1000,
      lastDrawnAtMs: 1000,
      commitVersion: 5,
      drawnVersion: 5,
      contentRevision: 5,
      trackReadyState: 'live',
      attached: true,
      nowMs: 1100,
    });
    assert.equal(action.type, 'none');
  });
});
