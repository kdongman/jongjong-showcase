import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureSyncUserCopy,
  decideCaptureScheduleTiming,
  isCaptureSyncErrorCode,
} from './captureSchedule';

describe('captureSchedule', () => {
  it('waits when target is still in the future', () => {
    const decision = decideCaptureScheduleTiming({
      targetLocalMs: 1000,
      nowLocalMs: 700,
    });
    assert.equal(decision.action, 'wait');
    if (decision.action === 'wait') assert.equal(decision.delayMs, 300);
  });

  it('captures immediately within 400ms grace', () => {
    const decision = decideCaptureScheduleTiming({
      targetLocalMs: 1000,
      nowLocalMs: 1250,
    });
    assert.equal(decision.action, 'capture-now');
  });

  it('still captures within 1500ms late window', () => {
    const decision = decideCaptureScheduleTiming({
      targetLocalMs: 1000,
      nowLocalMs: 1800,
    });
    assert.equal(decision.action, 'capture-now');
  });

  it('marks missed beyond 1500ms late', () => {
    const decision = decideCaptureScheduleTiming({
      targetLocalMs: 1000,
      nowLocalMs: 2600,
    });
    assert.equal(decision.action, 'missed');
  });

  it('does not classify sync codes as camera equipment failures', () => {
    assert.equal(isCaptureSyncErrorCode('CAPTURE_SCHEDULE_MISSED'), true);
    const copy = captureSyncUserCopy('CAPTURE_SCHEDULE_MISSED');
    assert.match(copy.title, /타이밍/);
    assert.equal(copy.detail.includes('장비'), false);
    assert.equal(copy.detail.includes('카메라 권한'), false);
  });
});
