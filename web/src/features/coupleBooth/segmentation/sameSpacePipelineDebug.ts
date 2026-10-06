import type { SameSpaceSourceId } from './videoFramePump';

export type SameSpaceSourceDebugSnapshot = {
  sourceId: SameSpaceSourceId;
  videoInstanceId: string;
  identityShort: string;
  trackSidShort: string;
  publicationSidShort: string;
  trackMuted: boolean | null;
  trackSubscribed: boolean | null;
  mediaTrackReadyState: string;
  mediaTrackMuted: boolean | null;
  readyState: number;
  paused: boolean;
  ended: boolean;
  currentTime: number;
  videoWidth: number;
  videoHeight: number;
  refReady: boolean;
  attached: boolean;
  pumpMode: string;
  pumpGeneration: number;
  rvfcRegistered: number;
  rvfcFired: number;
  rafFired: number;
  rafFallbackEngaged: number;
  watchdogRecoveryCount: number;
  pendingMarks: number;
  submitted: number;
  inferenceSuccess: number;
  inferenceFailure: number;
  staleGenerationDrops: number;
  committed: number;
  revision: number;
  /** Alias of revision — foreground commit generation. */
  commitVersion: number;
  /** Increments only when sampled pixels actually change. */
  contentRevision: number;
  /** Last revision painted by the visible compositor for this source. */
  lastDrawnVersion: number;
  /** Version recorded at the last WYSIWYG capture for this source. */
  captureVersion: number;
  compositeGeneration: number;
  lastCompositorFrameMs: number;
  commitAgeMs: number;
  drawAgeMs: number;
  pixelWriteAgeMs: number;
  lastRequestedMediaTime: number;
  lastCommittedMediaTime: number;
  lastCommittedAtMs: number;
  lastCallbackAgeMs: number;
  foregroundAgeMs: number;
  lastRestartReason: string;
  cleanupReason: string;
  readinessReason: string;
  /** waitingForTrack | warmingUp | ready | recovering | failed */
  status: string;
  placeholderReason: string;
  canvasWidth: number;
  canvasHeight: number;
  stageMount: number;
};

export function createEmptySourceDebug(sourceId: SameSpaceSourceId): SameSpaceSourceDebugSnapshot {
  return {
    sourceId,
    videoInstanceId: '-',
    identityShort: '-',
    trackSidShort: '-',
    publicationSidShort: '-',
    trackMuted: null,
    trackSubscribed: null,
    mediaTrackReadyState: '-',
    mediaTrackMuted: null,
    readyState: 0,
    paused: true,
    ended: false,
    currentTime: 0,
    videoWidth: 0,
    videoHeight: 0,
    refReady: false,
    attached: false,
    pumpMode: 'idle',
    pumpGeneration: 0,
    rvfcRegistered: 0,
    rvfcFired: 0,
    rafFired: 0,
    rafFallbackEngaged: 0,
    watchdogRecoveryCount: 0,
    pendingMarks: 0,
    submitted: 0,
    inferenceSuccess: 0,
    inferenceFailure: 0,
    staleGenerationDrops: 0,
    committed: 0,
    revision: 0,
    commitVersion: 0,
    contentRevision: 0,
    lastDrawnVersion: 0,
    captureVersion: 0,
    compositeGeneration: 0,
    lastCompositorFrameMs: 0,
    commitAgeMs: 0,
    drawAgeMs: 0,
    pixelWriteAgeMs: 0,
    lastRequestedMediaTime: Number.NaN,
    lastCommittedMediaTime: Number.NaN,
    lastCommittedAtMs: 0,
    lastCallbackAgeMs: 0,
    foregroundAgeMs: 0,
    lastRestartReason: '-',
    cleanupReason: '-',
    readinessReason: '-',
    status: 'waitingForTrack',
    placeholderReason: 'NO_TRACK',
    canvasWidth: 0,
    canvasHeight: 0,
    stageMount: 0,
  };
}

/** Short, non-PII fragment for HUD (never full UUID / email / token). */
export function shortId(value: string | null | undefined, keep = 8): string {
  if (!value) return '-';
  const trimmed = value.trim();
  if (!trimmed) return '-';
  return trimmed.length <= keep ? trimmed : trimmed.slice(0, keep);
}

export function isSameSpaceDebugEnabled(search = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  try {
    return new URLSearchParams(search).get('sameSpaceDebug') === '1';
  } catch {
    return false;
  }
}

export function formatDebugMediaTime(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(3);
}
