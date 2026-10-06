import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRemoteStall,
  createSourceSoakRing,
  describeCounterProgress,
} from './remoteSourceSoak';

describe('remoteSourceSoak', () => {
  it('classifies pump stall when currentTime advances without enqueue', () => {
    assert.equal(
      classifyRemoteStall({
        side: 'remote',
        videoCurrentTimeDelta: 0.2,
        enqueueDelta: 0,
        segmentOkDelta: 0,
        commitDelta: 0,
        drawnDelta: 0,
        contentRevisionDelta: 0,
        ages: {
          enqueueAgeMs: 2000,
          segmentAgeMs: 2000,
          commitAgeMs: 2000,
          drawAgeMs: 2000,
          contentAgeMs: 2000,
        },
      }),
      'REMOTE_PUMP_STALLED',
    );
  });

  it('detects commit without pixel fingerprint change', () => {
    assert.equal(
      classifyRemoteStall({
        side: 'remote',
        videoCurrentTimeDelta: 0.1,
        enqueueDelta: 1,
        segmentOkDelta: 1,
        commitDelta: 1,
        drawnDelta: 1,
        contentRevisionDelta: 0,
        ages: {
          enqueueAgeMs: 100,
          segmentAgeMs: 100,
          commitAgeMs: 100,
          drawAgeMs: 100,
          contentAgeMs: 4000,
        },
      }),
      'REMOTE_PIXELS_STALE',
    );
  });

  it('keeps a 180-sample ring for copy diagnostics', () => {
    const ring = createSourceSoakRing(180);
    for (let i = 0; i < 200; i += 1) {
      ring.push({
        tSec: i,
        side: 'remote',
        identityShort: 'abc',
        publicationSidShort: '-',
        trackSidShort: '-',
        trackReadyState: 'live',
        muted: false,
        videoCurrentTime: i,
        videoReadyState: 4,
        paused: false,
        videoWidth: 640,
        videoHeight: 480,
        pumpMode: 'rvfc',
        rvfcFired: i,
        rafFired: 0,
        rafFallbackEngaged: 0,
        heartbeatTick: i,
        forcedEnqueue: 0,
        schedulerEnqueue: i,
        segmentStart: i,
        segmentOk: i,
        segmentErr: 0,
        contentRevision: i,
        commitVersion: i,
        drawnVersion: i,
        commitAgeMs: 0,
        drawAgeMs: 0,
        busyAgeMs: 0,
        pumpGeneration: 1,
        attachCount: 1,
        detachCount: 0,
        restartCount: 0,
        lastRestartReason: '-',
        roomConnectCount: 1,
        roomDisconnectCount: 0,
        fingerprintChanged: true,
        stallClass: 'HEALTHY',
        lastIncreasedCounter: 'commit',
        firstStalledCounter: 'none',
      });
    }
    assert.equal(ring.snapshot().length, 180);
    assert.match(ring.toClipboardText(), /"sampleCount": 180/);
  });

  it('reports last increased vs first stalled counters', () => {
    const progress = describeCounterProgress({
      videoCurrentTime: 2,
      enqueue: 10,
      segmentOk: 10,
      commit: 10,
      drawn: 10,
      contentRevision: 9,
      prev: {
        videoCurrentTime: 1.5,
        enqueue: 9,
        segmentOk: 9,
        commit: 9,
        drawn: 9,
        contentRevision: 9,
      },
    });
    assert.equal(progress.lastIncreasedCounter, 'drawn');
    assert.equal(progress.firstStalledCounter, 'contentRevision');
  });
});
