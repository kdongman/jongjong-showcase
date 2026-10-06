/**
 * DEV remote/local source soak ring buffer + stall classifier.
 * Never stores frames, signed URLs, or JWTs.
 */

export type SourceSoakSide = 'local' | 'remote';

export type RemoteStallClass =
  | 'HEALTHY'
  | 'REMOTE_VIDEO_STALLED'
  | 'REMOTE_PUMP_STALLED'
  | 'REMOTE_SCHEDULER_STALLED'
  | 'REMOTE_COMMIT_STALLED'
  | 'REMOTE_DRAW_STALLED'
  | 'REMOTE_PIXELS_STALE';

export type SourceSoakSample = {
  tSec: number;
  side: SourceSoakSide;
  identityShort: string;
  publicationSidShort: string;
  trackSidShort: string;
  trackReadyState: string;
  muted: boolean | null;
  videoCurrentTime: number;
  videoReadyState: number;
  paused: boolean;
  videoWidth: number;
  videoHeight: number;
  pumpMode: string;
  rvfcFired: number;
  rafFired: number;
  rafFallbackEngaged: number;
  heartbeatTick: number;
  forcedEnqueue: number;
  schedulerEnqueue: number;
  segmentStart: number;
  segmentOk: number;
  segmentErr: number;
  contentRevision: number;
  commitVersion: number;
  drawnVersion: number;
  commitAgeMs: number;
  drawAgeMs: number;
  busyAgeMs: number;
  pumpGeneration: number;
  attachCount: number;
  detachCount: number;
  restartCount: number;
  lastRestartReason: string;
  roomConnectCount: number;
  roomDisconnectCount: number;
  fingerprintChanged: boolean;
  stallClass: RemoteStallClass;
  lastIncreasedCounter: string;
  firstStalledCounter: string;
};

const RING_SECONDS = 180;

export function classifyRemoteStall(input: {
  side: SourceSoakSide;
  videoCurrentTimeDelta: number;
  enqueueDelta: number;
  segmentOkDelta: number;
  commitDelta: number;
  drawnDelta: number;
  contentRevisionDelta: number;
  ages: {
    enqueueAgeMs: number;
    segmentAgeMs: number;
    commitAgeMs: number;
    drawAgeMs: number;
    contentAgeMs: number;
  };
}): RemoteStallClass {
  if (input.side !== 'remote') return 'HEALTHY';
  const stale = 1500;
  if (input.videoCurrentTimeDelta <= 0 && input.ages.enqueueAgeMs > stale) {
    return 'REMOTE_VIDEO_STALLED';
  }
  if (input.videoCurrentTimeDelta > 0 && input.enqueueDelta <= 0 && input.ages.enqueueAgeMs > stale) {
    return 'REMOTE_PUMP_STALLED';
  }
  if (input.enqueueDelta > 0 && input.segmentOkDelta <= 0 && input.ages.segmentAgeMs > stale) {
    return 'REMOTE_SCHEDULER_STALLED';
  }
  if (input.segmentOkDelta > 0 && input.commitDelta <= 0 && input.ages.commitAgeMs > stale) {
    return 'REMOTE_COMMIT_STALLED';
  }
  if (input.commitDelta > 0 && input.drawnDelta <= 0 && input.ages.drawAgeMs > stale) {
    return 'REMOTE_DRAW_STALLED';
  }
  if (input.commitDelta > 0 && input.contentRevisionDelta <= 0 && input.ages.contentAgeMs > stale * 2) {
    return 'REMOTE_PIXELS_STALE';
  }
  return 'HEALTHY';
}

export function describeCounterProgress(input: {
  videoCurrentTime: number;
  enqueue: number;
  segmentOk: number;
  commit: number;
  drawn: number;
  contentRevision: number;
  prev: {
    videoCurrentTime: number;
    enqueue: number;
    segmentOk: number;
    commit: number;
    drawn: number;
    contentRevision: number;
  } | null;
}): { lastIncreasedCounter: string; firstStalledCounter: string } {
  const counters: Array<{ name: string; curr: number; prev: number }> = [
    { name: 'video.currentTime', curr: input.videoCurrentTime, prev: input.prev?.videoCurrentTime ?? input.videoCurrentTime },
    { name: 'enqueue', curr: input.enqueue, prev: input.prev?.enqueue ?? input.enqueue },
    { name: 'segmentOk', curr: input.segmentOk, prev: input.prev?.segmentOk ?? input.segmentOk },
    { name: 'commit', curr: input.commit, prev: input.prev?.commit ?? input.commit },
    { name: 'drawn', curr: input.drawn, prev: input.prev?.drawn ?? input.drawn },
    { name: 'contentRevision', curr: input.contentRevision, prev: input.prev?.contentRevision ?? input.contentRevision },
  ];
  let lastIncreased = 'none';
  let firstStalled = 'none';
  for (const row of counters) {
    if (row.curr > row.prev + 1e-6) lastIncreased = row.name;
    else if (firstStalled === 'none' && input.prev) firstStalled = row.name;
  }
  return { lastIncreasedCounter: lastIncreased, firstStalledCounter: firstStalled };
}

export function createSourceSoakRing(capacitySeconds = RING_SECONDS) {
  const samples: SourceSoakSample[] = [];
  return {
    push(sample: SourceSoakSample) {
      samples.push(sample);
      while (samples.length > capacitySeconds) samples.shift();
    },
    snapshot(): SourceSoakSample[] {
      return samples.slice();
    },
    toClipboardText(): string {
      return JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          sampleCount: samples.length,
          samples,
        },
        null,
        2,
      );
    },
  };
}
