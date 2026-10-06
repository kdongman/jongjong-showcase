/**
 * Recoverable capture timing issues vs Review/session fatals.
 * Never surface CAPTURE_SCHEDULE_MISSED as a Review fatal banner.
 */

import { isCaptureSyncErrorCode } from '../utils/captureSchedule';

export type BoothPageIssue =
  | { scope: 'capture'; recoverable: true; code: string }
  | { scope: 'review'; recoverable: false; code: string }
  | { scope: 'session'; recoverable: false; code: string };

export function classifyBoothPageIssue(code: string | null | undefined): BoothPageIssue | null {
  if (!code) return null;
  const normalized = code.trim();
  if (!normalized) return null;
  if (isCaptureSyncErrorCode(normalized) || /capture_schedule|partner_capture_late|clock_sync/i.test(normalized)) {
    return { scope: 'capture', recoverable: true, code: normalized };
  }
  return { scope: 'session', recoverable: false, code: normalized };
}

export function isReviewUsable(input: {
  status: string | null | undefined;
  readyCandidateCount: number;
  captureInFlight?: boolean;
}): boolean {
  const status = input.status ?? '';
  if (status !== 'review' && status !== 'finalizing' && status !== 'completed') return false;
  if (input.captureInFlight) return false;
  return input.readyCandidateCount >= 4;
}

/** Fatal top banner — never for recoverable capture timing once Review is usable. */
export function shouldShowReviewFatalBanner(input: {
  pageError: string | null | undefined;
  status: string | null | undefined;
  readyCandidateCount: number;
  captureInFlight?: boolean;
}): boolean {
  if (!input.pageError) return false;
  const issue = classifyBoothPageIssue(input.pageError);
  if (!issue) return false;
  if (issue.scope === 'capture' && issue.recoverable) {
    // Soft copy only when Review is not yet usable.
    return !isReviewUsable(input);
  }
  return true;
}

export function reviewCaptureShortageCopy(): { title: string; detail: string } {
  return {
    title: '일부 사진의 촬영 타이밍이 맞지 않았어요',
    detail: '부족한 사진을 다시 찍어 주세요.',
  };
}
