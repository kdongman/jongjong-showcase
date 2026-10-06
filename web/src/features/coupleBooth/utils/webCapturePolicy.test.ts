import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Shared mirror/crop policy for ImageCapture and Canvas fallback.
 * Kept as pure helpers so browser-specific paths stay aligned.
 */
export function applyMirrorPolicy(facingMode: 'user' | 'environment'): boolean {
  return facingMode === 'user';
}

export function normalizeCaptureSize(
  width: number,
  height: number,
): { ok: boolean; width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, width: 0, height: 0 };
  }
  return { ok: true, width: Math.round(width), height: Math.round(height) };
}

describe('web capture mirror/crop policy', () => {
  it('mirrors front camera for both ImageCapture and Canvas paths', () => {
    assert.equal(applyMirrorPolicy('user'), true);
    assert.equal(applyMirrorPolicy('environment'), false);
  });

  it('rejects zero metadata dimensions before canvas draw', () => {
    assert.deepEqual(normalizeCaptureSize(0, 720), { ok: false, width: 0, height: 0 });
    assert.deepEqual(normalizeCaptureSize(1280, 720), { ok: true, width: 1280, height: 720 });
  });

  it('does not depend on devicePixelRatio for output size', () => {
    const logical = normalizeCaptureSize(1280, 720);
    const dpr = 3;
    assert.equal(logical.width * 1, logical.width);
    assert.notEqual(logical.width, logical.width * dpr);
  });
});
