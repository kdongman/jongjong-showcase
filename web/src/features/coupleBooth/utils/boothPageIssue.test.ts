import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isReviewUsable,
  shouldShowReviewFatalBanner,
} from './boothPageIssue';

describe('boothPageIssue', () => {
  it('hides CAPTURE_SCHEDULE_MISSED when Review has enough candidates', () => {
    assert.equal(isReviewUsable({ status: 'review', readyCandidateCount: 8 }), true);
    assert.equal(shouldShowReviewFatalBanner({
      pageError: 'CAPTURE_SCHEDULE_MISSED',
      status: 'review',
      readyCandidateCount: 8,
    }), false);
  });

  it('shows soft shortage path only when candidates are insufficient', () => {
    assert.equal(shouldShowReviewFatalBanner({
      pageError: 'CAPTURE_SCHEDULE_MISSED',
      status: 'review',
      readyCandidateCount: 2,
    }), true);
  });

  it('still shows non-capture session fatals in Review', () => {
    assert.equal(shouldShowReviewFatalBanner({
      pageError: 'COMPOSITION_SAVE_FAILED',
      status: 'review',
      readyCandidateCount: 8,
    }), true);
  });
});
