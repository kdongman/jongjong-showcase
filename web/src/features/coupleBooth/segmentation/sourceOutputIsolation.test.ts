import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  commitSegmentedSourceOutput,
  createSegmentedSourceOutput,
  type SegmentedSourceOutput,
} from '../composition/sameSpaceCanvasRenderer';
import type { LiveSegmentResult } from './LivePersonSegmenter';

type Call = { name: string; source?: unknown };

function fakeContext(calls: Call[] = []) {
  let composite = 'source-over';
  return {
    calls,
    get globalCompositeOperation() { return composite; },
    set globalCompositeOperation(value: string) { composite = value; calls.push({ name: `op:${value}` }); },
    save: () => calls.push({ name: 'save' }),
    restore: () => calls.push({ name: 'restore' }),
    clearRect: () => calls.push({ name: 'clear' }),
    drawImage: (source: unknown) => calls.push({ name: 'draw', source }),
    putImageData: () => calls.push({ name: 'put' }),
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
  };
}

function fakeOutput(generation = 1): SegmentedSourceOutput {
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  const rgbCanvas = { width: 0, height: 0 } as HTMLCanvasElement;
  const alphaCanvas = { width: 0, height: 0 } as HTMLCanvasElement;
  return {
    canvas,
    context: fakeContext() as unknown as CanvasRenderingContext2D,
    rgbCanvas,
    rgbContext: fakeContext() as unknown as CanvasRenderingContext2D,
    alphaCanvas,
    alphaContext: fakeContext() as unknown as CanvasRenderingContext2D,
    generation,
    revision: 0,
    contentRevision: 0,
    contentChecksum: 0,
    lastPixelWriteAtMs: 0,
    lastValidAtMs: 0,
  };
}

function result(sourceKey: 'local' | 'remote', marker: number): LiveSegmentResult {
  const rgb = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([marker, 0, 0, 255, marker, 0, 0, 255, marker, 0, 0, 255, marker, 0, 0, 255]),
  } as ImageData;
  return {
    rgb,
    mask: {
      width: 2,
      height: 2,
      alpha: new Uint8ClampedArray([255, 0, 0, 0]),
      bounds: { minX: 0.1, minY: 0.1, maxX: 0.8, maxY: 0.9 },
      valid: true,
    },
    sourceWidth: 20,
    sourceHeight: 20,
    inferWidth: 2,
    inferHeight: 2,
    sourceKey,
  };
}

describe('Same Space per-source output isolation', () => {
  it('keeps local output intact after a later remote commit', () => {
    const local = fakeOutput();
    const remote = fakeOutput();
    assert.equal(commitSegmentedSourceOutput(local, result('local', 11)), true);
    assert.equal(local.revision, 1);
    const localRevision = local.revision;
    const localCanvas = local.canvas;
    assert.equal(commitSegmentedSourceOutput(remote, result('remote', 22)), true);
    assert.equal(remote.revision, 1);
    assert.equal(local.revision, localRevision);
    assert.equal(local.canvas, localCanvas);
    assert.notEqual(local.canvas, remote.canvas);
    assert.notEqual(local.rgbCanvas, remote.rgbCanvas);
    assert.notEqual(local.alphaCanvas, remote.alphaCanvas);
  });

  it('rejects cross-generation commits so stale async results cannot overwrite', () => {
    const output = fakeOutput(3);
    assert.equal(commitSegmentedSourceOutput(output, result('remote', 9), 2), false);
    assert.equal(output.revision, 0);
  });

  it('createSegmentedSourceOutput returns independent buffers when document exists', () => {
    // jsdom/document may be absent in node test runner — null is acceptable.
    const a = createSegmentedSourceOutput(1);
    const b = createSegmentedSourceOutput(1);
    if (!a || !b) {
      assert.equal(a, b);
      return;
    }
    assert.notEqual(a.canvas, b.canvas);
    assert.notEqual(a.context, b.context);
  });
});
