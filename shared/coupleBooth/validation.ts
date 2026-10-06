import {
  MEDIA_CRITICAL_REMAINING_SECONDS,
  MEDIA_WARN_REMAINING_SECONDS,
  MINIMUM_CAPTURE_WINDOW_MS,
  REQUIRED_SELECTED_SHOTS,
  TOTAL_SHOTS,
  type BoothCandidate,
  type BoothShotRow,
  type CaptureTimerPhase,
} from './types';
import { isExactSelection } from './selection';

export function validateCaptureIdempotency(seen: Set<string>, captureId: string, userId: string): boolean {
  const key = `${captureId}:${userId}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

export function validateUploadIdempotency(seen: Set<string>, captureId: string, userId: string): boolean {
  return validateCaptureIdempotency(seen, captureId, userId);
}

/**
 * A paired candidate is valid only when host+guest share the same captureId
 * for that shot_index — prevents mixing old/new versions after a reshoot.
 */
export function pairedShotsForIndex(
  shots: BoothShotRow[],
  shotIndex: number,
  hostUserId: string,
  guestUserId: string,
): { hostShot?: BoothShotRow; guestShot?: BoothShotRow; matched: boolean } {
  const hostShot = shots.find((shot) => shot.shotIndex === shotIndex && shot.userId === hostUserId);
  const guestShot = shots.find((shot) => shot.shotIndex === shotIndex && shot.userId === guestUserId);
  if (!hostShot || !guestShot) return { hostShot, guestShot, matched: false };
  return {
    hostShot,
    guestShot,
    matched: hostShot.captureId === guestShot.captureId,
  };
}

export function missingShotIndexes(shots: BoothShotRow[], hostUserId: string, guestUserId: string): number[] {
  const missing: number[] = [];
  for (let shotIndex = 1; shotIndex <= TOTAL_SHOTS; shotIndex += 1) {
    const pair = pairedShotsForIndex(shots, shotIndex, hostUserId, guestUserId);
    if (!pair.matched) missing.push(shotIndex);
  }
  return missing;
}

export function buildCandidates(
  shots: BoothShotRow[],
  hostUserId: string,
  guestUserId: string,
): BoothCandidate[] {
  return Array.from({ length: TOTAL_SHOTS }, (_, index) => {
    const shotIndex = index + 1;
    const pair = pairedShotsForIndex(shots, shotIndex, hostUserId, guestUserId);
    return {
      shotIndex,
      hostShot: pair.matched ? pair.hostShot : undefined,
      guestShot: pair.matched ? pair.guestShot : undefined,
    };
  });
}

export function assertReadyForFinalize(input: {
  selectedShotIndexes: number[];
  hostApproved: boolean;
  guestApproved: boolean;
  allowHostSolo: boolean;
  shots: BoothShotRow[];
  hostUserId: string;
  guestUserId: string;
}): void {
  if (!isExactSelection(input.selectedShotIndexes)) {
    throw new Error('SELECTION_INCOMPLETE');
  }
  const missing = missingShotIndexes(input.shots, input.hostUserId, input.guestUserId);
  const selectedMissing = input.selectedShotIndexes.filter((index) => missing.includes(index));
  if (selectedMissing.length) {
    throw new Error(`MISSING_SELECTED_SHOTS:${selectedMissing.join(',')}`);
  }
  if (!input.hostApproved) throw new Error('HOST_APPROVAL_REQUIRED');
  if (!input.guestApproved && !input.allowHostSolo) throw new Error('GUEST_APPROVAL_REQUIRED');
}

export function mediaRemainingMs(mediaExpiresAt: string | null | undefined, now = Date.now()): number {
  if (!mediaExpiresAt) return 0;
  return Math.max(0, Date.parse(mediaExpiresAt) - now);
}

export function mediaRemainingSeconds(mediaExpiresAt: string | null | undefined, now = Date.now()): number {
  return Math.ceil(mediaRemainingMs(mediaExpiresAt, now) / 1000);
}

export function isMediaExpired(mediaExpiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!mediaExpiresAt) return false;
  return mediaRemainingMs(mediaExpiresAt, now) <= 0;
}

/** Capture clock has not started — UI must not count down. */
export function isCaptureClockActive(input: {
  captureStartedAt?: string | null;
  mediaExpiresAt?: string | null;
}): boolean {
  return Boolean(input.captureStartedAt && input.mediaExpiresAt);
}

/** Host may schedule another pose only if the server clock still has enough headroom. */
export function canScheduleNextCapture(
  mediaExpiresAt: string | null | undefined,
  now = Date.now(),
  minimumWindowMs = MINIMUM_CAPTURE_WINDOW_MS,
): boolean {
  if (!mediaExpiresAt) return false;
  return mediaRemainingMs(mediaExpiresAt, now) >= minimumWindowMs;
}

export function captureTimerPhase(
  remainingSec: number | null,
  clockActive: boolean,
): CaptureTimerPhase {
  if (!clockActive || remainingSec == null) return 'idle';
  if (remainingSec <= 0) return 'expired';
  if (remainingSec <= MEDIA_CRITICAL_REMAINING_SECONDS) return 'critical';
  if (remainingSec <= MEDIA_WARN_REMAINING_SECONDS) return 'warn';
  return 'running';
}

export function formatCaptureCountdown(remainingSec: number): string {
  const safe = Math.max(0, remainingSec);
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function isSessionExpired(expiresAt: string, now = Date.now()): boolean {
  return Date.parse(expiresAt) <= now;
}

/** Pure helpers for concurrent finalize / claim semantics (unit tested). */
export function canClaimFinalization(input: {
  status: string;
  hostApproved: boolean;
  guestApproved: boolean;
  allowHostSolo: boolean;
  isHost: boolean;
  finalizingClaimedBy: string | null;
  finalImagePath: string | null;
  actorId: string;
}): 'claim' | 'recover_completed' | 'claimed_by_other' | 'reject' {
  if (input.status === 'completed' && input.finalImagePath) return 'recover_completed';
  if (input.status === 'finalizing' && input.finalizingClaimedBy && input.finalizingClaimedBy !== input.actorId) {
    return 'claimed_by_other';
  }
  if (input.status !== 'review' && input.status !== 'finalizing') return 'reject';
  if (!input.hostApproved) return 'reject';
  if (!input.guestApproved && !(input.allowHostSolo && input.isHost)) return 'reject';
  if (input.finalizingClaimedBy && input.finalizingClaimedBy !== input.actorId) return 'claimed_by_other';
  return 'claim';
}

export { REQUIRED_SELECTED_SHOTS, TOTAL_SHOTS };
