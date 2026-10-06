import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBoothStripLayout } from './layout';
import {
  isMediaExpired,
  mediaRemainingMs,
  missingShotIndexes,
  validateCaptureIdempotency,
  validateUploadIdempotency,
} from './validation';
import type { BoothShotRow } from './types';

describe('couple booth validation', () => {
  it('ignores duplicate capture/upload events', () => {
    const seen = new Set<string>();
    assert.equal(validateCaptureIdempotency(seen, 'c1', 'u1'), true);
    assert.equal(validateCaptureIdempotency(seen, 'c1', 'u1'), false);
    assert.equal(validateUploadIdempotency(seen, 'c1', 'u2'), true);
  });

  it('finds missing paired shots', () => {
    const shots: BoothShotRow[] = [
      {
        id: '1',
        sessionId: 's',
        userId: 'host',
        shotIndex: 1,
        captureId: 'a',
        imagePath: 'p',
        capturedAt: new Date().toISOString(),
      },
    ];
    assert.deepEqual(missingShotIndexes(shots, 'host', 'guest').slice(0, 2), [1, 2]);
  });

  it('enforces media expiry against server media_expires_at', () => {
    const expires = new Date(Date.now() - 1000).toISOString();
    assert.equal(isMediaExpired(expires), true);
    assert.equal(mediaRemainingMs(new Date(Date.now() + 5000).toISOString()) > 0, true);
  });

  it('computes fixed strip layout', () => {
    const layout = computeBoothStripLayout(1080, 2400);
    assert.equal(layout.width, 1080);
    assert.equal(layout.height, 2400);
    assert.equal(layout.rows.length, 4);
    assert.ok(layout.cellWidth > 0);
    assert.ok(layout.cellHeight > 0);
  });
});
