import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUPLE_BOOTH_CAPTURE_DURATION_MS,
  COUPLE_BOOTH_CAPTURE_DURATION_SECONDS,
  MINIMUM_CAPTURE_WINDOW_MS,
} from './types';
import {
  canScheduleNextCapture,
  captureTimerPhase,
  formatCaptureCountdown,
  isCaptureClockActive,
  isMediaExpired,
  mediaRemainingMs,
  mediaRemainingSeconds,
} from './validation';

describe('couple booth 90s capture clock', () => {
  it('exposes a single 90s duration constant', () => {
    assert.equal(COUPLE_BOOTH_CAPTURE_DURATION_SECONDS, 90);
    assert.equal(COUPLE_BOOTH_CAPTURE_DURATION_MS, 90_000);
  });

  it('does not treat join/ready as an active capture clock', () => {
    assert.equal(isCaptureClockActive({ captureStartedAt: null, mediaExpiresAt: null }), false);
    assert.equal(
      isCaptureClockActive({
        captureStartedAt: null,
        mediaExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      }),
      false,
    );
    assert.equal(
      isCaptureClockActive({
        captureStartedAt: new Date().toISOString(),
        mediaExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      }),
      true,
    );
  });

  it('starts a 90s window from capture_started_at semantics', () => {
    const started = Date.now();
    const expires = new Date(started + COUPLE_BOOTH_CAPTURE_DURATION_MS).toISOString();
    assert.equal(mediaRemainingSeconds(expires, started), 90);
    assert.equal(isMediaExpired(expires, started + COUPLE_BOOTH_CAPTURE_DURATION_MS), true);
    assert.equal(isMediaExpired(expires, started + COUPLE_BOOTH_CAPTURE_DURATION_MS - 1), false);
  });

  it('does not extend time on duplicate start (same expiresAt reused)', () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    const first = mediaRemainingMs(expires);
    const second = mediaRemainingMs(expires);
    assert.ok(Math.abs(first - second) < 50);
  });

  it('blocks scheduling when remaining window is below minimum', () => {
    const almostGone = new Date(Date.now() + MINIMUM_CAPTURE_WINDOW_MS - 100).toISOString();
    const enough = new Date(Date.now() + MINIMUM_CAPTURE_WINDOW_MS + 200).toISOString();
    assert.equal(canScheduleNextCapture(almostGone), false);
    assert.equal(canScheduleNextCapture(enough), true);
    assert.equal(canScheduleNextCapture(null), false);
  });

  it('maps warn / critical / idle timer phases', () => {
    assert.equal(captureTimerPhase(null, false), 'idle');
    assert.equal(captureTimerPhase(90, true), 'running');
    assert.equal(captureTimerPhase(20, true), 'warn');
    assert.equal(captureTimerPhase(10, true), 'critical');
    assert.equal(captureTimerPhase(0, true), 'expired');
  });

  it('formats 01:30 countdown for UI', () => {
    assert.equal(formatCaptureCountdown(90), '01:30');
    assert.equal(formatCaptureCountdown(9), '00:09');
  });

  it('uses server media_expires_at even when client clock is skewed', () => {
    const serverExpiry = Date.now() + 5_000;
    const clientAhead = Date.now() + 5_000;
    assert.equal(isMediaExpired(new Date(serverExpiry).toISOString(), clientAhead), true);
    assert.ok(mediaRemainingMs(new Date(serverExpiry).toISOString(), Date.now()) > 0);
  });

  it('treats exact 90s boundary as expired and 89s as active', () => {
    const start = 1_000_000;
    const expires = new Date(start + 90_000).toISOString();
    assert.equal(isMediaExpired(expires, start + 89_000), false);
    assert.equal(isMediaExpired(expires, start + 90_000), true);
  });

  it('keeps review out of capture clock concerns (no expires ⇒ idle)', () => {
    // Review screens pass no active clock; phase stays idle so UI never rushes selection.
    assert.equal(captureTimerPhase(null, false), 'idle');
    assert.equal(canScheduleNextCapture(undefined), false);
  });
});
