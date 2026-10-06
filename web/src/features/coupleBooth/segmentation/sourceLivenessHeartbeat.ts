/**
 * Pure recovery policy for Same Space per-source liveness.
 * Decisions never remount the whole stage or restart the sibling source.
 */

export type SourceLivenessSnapshot = {
  sourceId: 'local' | 'remote';
  videoCurrentTime: number;
  lastEnqueueAtMs: number;
  lastSegmentSuccessAtMs: number;
  lastCommitAtMs: number;
  lastDrawnAtMs: number;
  commitVersion: number;
  drawnVersion: number;
  contentRevision: number;
  trackReadyState: string;
  attached: boolean;
  nowMs: number;
};

export type SourceRecoveryAction =
  | { type: 'none'; reason: string }
  | { type: 'rearm-and-enqueue'; reason: string }
  | { type: 'recover-scheduler'; reason: string }
  | { type: 'recover-commit'; reason: string }
  | { type: 'recover-compositor'; reason: string }
  | { type: 'recover-track-attach'; reason: string };

export const SOURCE_HEARTBEAT_MS = 220;
export const ENQUEUE_STALE_MS = 500;
export const SEGMENT_STALE_MS = 1000;
export const COMMIT_STALE_MS = 500;
export const DRAW_STALE_MS = 500;
export const CURRENT_TIME_EPSILON = 0.0005;

export function decideSourceRecovery(input: SourceLivenessSnapshot & {
  previousCurrentTime: number;
}): SourceRecoveryAction {
  const {
    nowMs,
    videoCurrentTime,
    previousCurrentTime,
    lastEnqueueAtMs,
    lastSegmentSuccessAtMs,
    lastCommitAtMs,
    lastDrawnAtMs,
    commitVersion,
    drawnVersion,
    attached,
    trackReadyState,
  } = input;

  const currentTimeAdvancing = Number.isFinite(videoCurrentTime)
    && Number.isFinite(previousCurrentTime)
    && Math.abs(videoCurrentTime - previousCurrentTime) > CURRENT_TIME_EPSILON;

  const enqueueAge = lastEnqueueAtMs > 0 ? nowMs - lastEnqueueAtMs : Number.POSITIVE_INFINITY;
  const segmentAge = lastSegmentSuccessAtMs > 0 ? nowMs - lastSegmentSuccessAtMs : Number.POSITIVE_INFINITY;
  const commitAge = lastCommitAtMs > 0 ? nowMs - lastCommitAtMs : Number.POSITIVE_INFINITY;
  const drawAge = lastDrawnAtMs > 0 ? nowMs - lastDrawnAtMs : Number.POSITIVE_INFINITY;

  if (!attached || trackReadyState === 'ended') {
    return { type: 'recover-track-attach', reason: 'track-missing-or-ended' };
  }

  if (!currentTimeAdvancing && enqueueAge > ENQUEUE_STALE_MS) {
    return { type: 'recover-track-attach', reason: 'current-time-stalled' };
  }

  if (currentTimeAdvancing && enqueueAge > ENQUEUE_STALE_MS) {
    return { type: 'rearm-and-enqueue', reason: 'current-time-without-enqueue' };
  }

  if (enqueueAge < ENQUEUE_STALE_MS && segmentAge > SEGMENT_STALE_MS) {
    return { type: 'recover-scheduler', reason: 'enqueue-without-segment' };
  }

  if (segmentAge < SEGMENT_STALE_MS && commitAge > COMMIT_STALE_MS) {
    return { type: 'recover-commit', reason: 'segment-without-commit' };
  }

  if (commitVersion > drawnVersion && drawAge > DRAW_STALE_MS) {
    return { type: 'recover-compositor', reason: 'commit-without-draw' };
  }

  if (commitVersion > 0 && commitVersion === drawnVersion && commitAge > COMMIT_STALE_MS * 4 && currentTimeAdvancing) {
    return { type: 'rearm-and-enqueue', reason: 'content-may-be-stale' };
  }

  return { type: 'none', reason: 'healthy' };
}
