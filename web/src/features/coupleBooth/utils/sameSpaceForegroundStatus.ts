/**
 * Per-source foreground readiness — independent of background, partner, positions.
 */

export type ForegroundStatus =
  | 'waitingForTrack'
  | 'warmingUp'
  | 'ready'
  | 'recovering'
  | 'failed';

export type ForegroundPlaceholderReason =
  | 'NONE'
  | 'NO_TRACK'
  | 'VIDEO_NOT_READY'
  | 'NO_FIRST_FRAME'
  | 'NO_SEGMENT_COMMIT'
  | 'CANVAS_REF_MISMATCH'
  | 'STALE_GENERATION'
  | 'FAILED';

export function resolveForegroundStatus(input: {
  hasTrackOrExpectation: boolean;
  videoReady: boolean;
  hasCommittedForeground: boolean;
  reconnecting: boolean;
  consecutiveFailures: number;
}): ForegroundStatus {
  if (!input.hasTrackOrExpectation) return 'waitingForTrack';
  if (input.hasCommittedForeground && input.reconnecting) return 'recovering';
  if (input.hasCommittedForeground) return 'ready';
  if (input.consecutiveFailures >= 12) return 'failed';
  if (!input.videoReady) return 'warmingUp';
  return 'warmingUp';
}

export function resolveForegroundPlaceholderReason(input: {
  status: ForegroundStatus;
  hasTrackOrExpectation: boolean;
  videoReady: boolean;
  hasCommittedForeground: boolean;
  canvasPresent: boolean;
  generationMatch: boolean;
}): ForegroundPlaceholderReason {
  if (input.hasCommittedForeground) return 'NONE';
  if (!input.hasTrackOrExpectation) return 'NO_TRACK';
  if (!input.canvasPresent) return 'CANVAS_REF_MISMATCH';
  if (!input.generationMatch) return 'STALE_GENERATION';
  if (!input.videoReady) return 'VIDEO_NOT_READY';
  if (input.status === 'failed') return 'FAILED';
  if (input.status === 'warmingUp') return 'NO_SEGMENT_COMMIT';
  return 'NO_FIRST_FRAME';
}

/** True when the soft silhouette may show — warm-up only, never after first commit. */
export function shouldShowWarmupPlaceholder(status: ForegroundStatus): boolean {
  return status === 'warmingUp' || status === 'waitingForTrack';
}
