import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeCompactCoupleComposition, pullCoupleCloser } from './compactCoupleComposition';
import { defaultPersonBounds } from './sameSpaceComposition';

describe('compactCoupleComposition', () => {
  it('packs one_cell tightly with small or negative gap', () => {
    const result = computeCompactCoupleComposition({
      sceneWidth: 1200,
      sceneHeight: 900,
      leftBounds: { minX: 0.3, minY: 0.12, maxX: 0.7, maxY: 0.92 },
      rightBounds: { minX: 0.28, minY: 0.14, maxX: 0.72, maxY: 0.9 },
      spanMode: 'one_cell',
    });
    assert.ok(result.groupWidthRatio >= 0.3);
    assert.ok(result.visualGap <= 0.03);
    assert.ok(result.leftTransform.scale >= 1);
    assert.ok(result.rightTransform.scale >= 1);
  });

  it('packs two_cell with wider pose room', () => {
    const result = computeCompactCoupleComposition({
      sceneWidth: 1200,
      sceneHeight: 900,
      leftBounds: { minX: 0.3, minY: 0.12, maxX: 0.7, maxY: 0.92 },
      rightBounds: { minX: 0.28, minY: 0.14, maxX: 0.72, maxY: 0.9 },
      spanMode: 'two_cell',
    });
    assert.ok(result.groupWidthRatio >= 0.5);
    assert.ok(result.visualGap <= 0.12);
  });

  it('balances uneven person heights', () => {
    const result = computeCompactCoupleComposition({
      sceneWidth: 1200,
      sceneHeight: 900,
      leftBounds: { minX: 0.3, minY: 0.05, maxX: 0.7, maxY: 0.55 },
      rightBounds: defaultPersonBounds(),
      spanMode: 'two_cell',
    });
    assert.ok(result.leftTransform.scale > 0.6);
    assert.ok(result.rightTransform.scale > 0.6);
  });

  it('pullCoupleCloser reduces visual gap without changing scale', () => {
    const left = { offsetX: -0.12, offsetY: 0, scale: 0.9 };
    const right = { offsetX: 0.12, offsetY: 0, scale: 0.9 };
    const narrow = { minX: 0.35, minY: 0.1, maxX: 0.65, maxY: 0.9 };
    const next = pullCoupleCloser({
      left,
      right,
      leftBounds: narrow,
      rightBounds: narrow,
      targetGap: -0.01,
    });
    assert.equal(next.left.scale, 0.9);
    assert.equal(next.right.scale, 0.9);
    assert.ok(next.left.offsetX > left.offsetX);
    assert.ok(next.right.offsetX < right.offsetX);
  });

  it('preserves manual user scale when recomputing packing base', () => {
    const auto = computeCompactCoupleComposition({
      sceneWidth: 1200,
      sceneHeight: 900,
      leftBounds: defaultPersonBounds(),
      rightBounds: defaultPersonBounds(),
      spanMode: 'one_cell',
    });
    const zoomed = computeCompactCoupleComposition({
      sceneWidth: 1200,
      sceneHeight: 900,
      leftBounds: defaultPersonBounds(),
      rightBounds: defaultPersonBounds(),
      leftManual: { offsetX: 0, offsetY: 0, scale: 1.35, mode: 'manual' },
      rightManual: { offsetX: 0, offsetY: 0, scale: 1, mode: 'manual' },
      spanMode: 'one_cell',
    });
    assert.ok(Math.abs(zoomed.leftTransform.scale - auto.leftBase.scale * 1.35) < 0.02);
    assert.equal(zoomed.leftBase.scale, auto.leftBase.scale);
  });
});
