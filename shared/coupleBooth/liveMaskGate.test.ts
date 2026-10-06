import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMaskGateState,
  shouldAcceptLiveMask,
  type MaskValiditySample,
} from './liveMaskGate';

function sample(partial: Partial<MaskValiditySample>): MaskValiditySample {
  return {
    areaRatio: 0.2,
    minY: 0.1,
    maxY: 0.9,
    minX: 0.2,
    maxX: 0.8,
    personPixels: 2000,
    ...partial,
  };
}

describe('liveMaskGate', () => {
  it('accepts the first valid mask', () => {
    const state = createMaskGateState();
    const result = shouldAcceptLiveMask(state, sample({}));
    assert.equal(result.accept, true);
    assert.ok(state.lastGood);
  });

  it('rejects a sudden head-chop partial mask and keeps last good', () => {
    const state = createMaskGateState();
    shouldAcceptLiveMask(state, sample({ minY: 0.08, maxY: 0.92, areaRatio: 0.22 }));
    const bad = shouldAcceptLiveMask(state, sample({
      minY: 0.35,
      maxY: 0.92,
      areaRatio: 0.14,
      personPixels: 1200,
    }));
    assert.equal(bad.accept, false);
    assert.equal(bad.reason, 'head-chop');
    assert.equal(state.lastGood?.minY, 0.08);
  });

  it('rejects area collapse', () => {
    const state = createMaskGateState();
    shouldAcceptLiveMask(state, sample({ areaRatio: 0.25, personPixels: 3000 }));
    const bad = shouldAcceptLiveMask(state, sample({
      areaRatio: 0.08,
      personPixels: 400,
      minY: 0.12,
      maxY: 0.88,
    }));
    assert.equal(bad.accept, false);
    assert.equal(bad.reason, 'area-collapse');
  });

  it('accepts a healthy follow-up after a rejected partial', () => {
    const state = createMaskGateState();
    shouldAcceptLiveMask(state, sample({ minY: 0.08 }));
    shouldAcceptLiveMask(state, sample({ minY: 0.4, areaRatio: 0.1 }));
    const good = shouldAcceptLiveMask(state, sample({ minY: 0.09, areaRatio: 0.21 }));
    assert.equal(good.accept, true);
  });
});
