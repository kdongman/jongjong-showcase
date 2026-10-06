import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processSegmentationMask } from './maskProcessing';

describe('processSegmentationMask', () => {
  it('builds dominant person bounds from a confidence blob', () => {
    const width = 32;
    const height = 32;
    const values = new Float32Array(width * height);
    for (let y = 8; y < 28; y += 1) {
      for (let x = 10; x < 22; x += 1) {
        values[y * width + x] = 0.9;
      }
    }
    // isolated noise
    values[1] = 0.95;
    const mask = processSegmentationMask({ values, width, height, isConfidence: true });
    assert.equal(mask.valid, true);
    assert.ok(mask.bounds);
    // Blob occupies x=10..21 (~0.31–0.66) before padding; padded bounds stay inward of edges.
    assert.ok(mask.bounds!.minX > 0.15 && mask.bounds!.minX < 0.4);
    assert.ok(mask.bounds!.maxX > 0.6 && mask.bounds!.maxX < 0.85);
    assert.ok(mask.bounds!.minY < 0.4);
    assert.ok(mask.bounds!.maxY > 0.7);
  });

  it('marks empty masks invalid', () => {
    const values = new Float32Array(16);
    const mask = processSegmentationMask({ values, width: 4, height: 4, isConfidence: true });
    assert.equal(mask.valid, false);
    assert.equal(mask.bounds, null);
  });
});
