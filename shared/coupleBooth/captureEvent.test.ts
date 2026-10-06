import assert from 'node:assert/strict';
import test from 'node:test';
import { captureTimingDeltaMs, claimBoothCaptureEvent, createBoothCaptureEvent } from './captureEvent';

test('one logical capture event cannot be processed twice', () => {
  const seen = new Set<string>();
  const event = createBoothCaptureEvent({ captureId: 'event-1', shotIndex: 1, captureAt: 10_000 });
  assert.equal(claimBoothCaptureEvent(seen, event).accepted, true);
  assert.deepEqual(claimBoothCaptureEvent(seen, event), { accepted: false, reason: 'duplicate', event });
});

test('capture timing remains explicit and measurable', () => {
  const event = createBoothCaptureEvent({ captureId: 'event-2', shotIndex: 2, captureAt: '1970-01-01T00:00:10.000Z' });
  assert.equal(captureTimingDeltaMs(event, 10_125), 125);
});
