import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeSameSpacePersonPlacement, defaultPersonBounds } from '@shared/sameSpaceComposition';
import { clampManualOffset, DEFAULT_SAME_SPACE_MANUAL_OFFSET } from '@shared/sameSpaceLayoutSpec';

/**
 * Left thumbnail / right strip / export must share the same placement path
 * for a given shotIndex transform.
 */
describe('composition placement SSOT', () => {
  it('same inputs yield matching personDest across preview sizes (normalized)', () => {
    const manual = clampManualOffset({
      ...DEFAULT_SAME_SPACE_MANUAL_OFFSET,
      offsetX: 0.08,
      offsetY: -0.04,
      scale: 1.2,
      mode: 'manual',
    });
    const bounds = defaultPersonBounds();
    const large = computeSameSpacePersonPlacement({
      canvasWidth: 1200,
      canvasHeight: 900,
      sourceWidth: 640,
      sourceHeight: 480,
      personBounds: bounds,
      normalizedTransform: { x: 0, y: 0, scale: 1 },
      manualOffset: manual,
      slot: 'left',
      soloLayout: 'half',
      participantCount: 2,
      spanMode: 'two_cell',
    });
    const strip = computeSameSpacePersonPlacement({
      canvasWidth: 300,
      canvasHeight: 225,
      sourceWidth: 640,
      sourceHeight: 480,
      personBounds: bounds,
      normalizedTransform: { x: 0, y: 0, scale: 1 },
      manualOffset: manual,
      slot: 'left',
      soloLayout: 'half',
      participantCount: 2,
      spanMode: 'two_cell',
    });

    const norm = (rect: { x: number; y: number; width: number; height: number }, w: number, h: number) => ({
      x: rect.x / w,
      y: rect.y / h,
      width: rect.width / w,
      height: rect.height / h,
    });
    const a = norm(large.personDest, 1200, 900);
    const b = norm(strip.personDest, 300, 225);
    assert.ok(Math.abs(a.x - b.x) < 1 / 300);
    assert.ok(Math.abs(a.y - b.y) < 1 / 225);
    assert.ok(Math.abs(a.width - b.width) < 1 / 300);
    assert.ok(Math.abs(a.height - b.height) < 1 / 225);
  });

  it('local drag leaves remote transform unchanged', () => {
    const left = clampManualOffset({ ...DEFAULT_SAME_SPACE_MANUAL_OFFSET, offsetX: 0.1, mode: 'manual' });
    const right = { ...DEFAULT_SAME_SPACE_MANUAL_OFFSET };
    const next = { left, right };
    assert.equal(next.right.offsetX, 0);
    assert.equal(next.right.scale, 1);
  });

  it('remote resize leaves local scale unchanged', () => {
    const left = { ...DEFAULT_SAME_SPACE_MANUAL_OFFSET, scale: 1.3 };
    const right = clampManualOffset({ ...DEFAULT_SAME_SPACE_MANUAL_OFFSET, scale: 0.85, mode: 'manual' });
    assert.equal(left.scale, 1.3);
    assert.equal(right.scale, 0.85);
  });
});
