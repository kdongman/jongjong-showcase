import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canDrawSameSpaceRawVideo,
  commitSegmentedSourceOutput,
  drawSameSpacePersonLayer,
  isForegroundReconnecting,
  isForegroundStale,
  SAME_SPACE_FOREGROUND_RECONNECTING_MS,
  SAME_SPACE_FOREGROUND_STALE_MS,
  type SegmentedSourceOutput,
} from './sameSpaceCanvasRenderer';
import type { LiveSegmentResult } from '../segmentation/LivePersonSegmenter';

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
    fillRect: () => calls.push({ name: 'fillRect' }),
    beginPath: () => calls.push({ name: 'beginPath' }),
    ellipse: () => calls.push({ name: 'ellipse' }),
    fill: () => calls.push({ name: 'fill' }),
    fillText: () => calls.push({ name: 'fillText' }),
    drawImage: (source: unknown) => calls.push({ name: 'draw', source }),
    putImageData: () => calls.push({ name: 'put' }),
    createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
  };
}

function fakeOutput(generation = 1): { output: SegmentedSourceOutput; calls: Call[] } {
  const calls: Call[] = [];
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  const rgbCanvas = { width: 0, height: 0 } as HTMLCanvasElement;
  const alphaCanvas = { width: 0, height: 0 } as HTMLCanvasElement;
  return {
    output: {
      canvas,
      context: fakeContext(calls) as unknown as CanvasRenderingContext2D,
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
    },
    calls,
  };
}

function result(valid = true): LiveSegmentResult {
  return {
    rgb: { width: 2, height: 2, data: new Uint8ClampedArray(16) } as ImageData,
    mask: {
      width: 2,
      height: 2,
      alpha: new Uint8ClampedArray([255, 0, 0, 0]),
      bounds: valid ? { minX: 0.1, minY: 0.1, maxX: 0.8, maxY: 0.9 } : null,
      valid,
    },
    sourceWidth: 20,
    sourceHeight: 20,
    inferWidth: 2,
    inferHeight: 2,
    sourceKey: 'local',
  };
}

function drawLayer(output: SegmentedSourceOutput | null, calls: Call[] = []) {
  drawSameSpacePersonLayer(fakeContext(calls) as unknown as CanvasRenderingContext2D, 100, 100, {
    slot: 'left', output, bounds: { minX: 0.1, minY: 0.1, maxX: 0.8, maxY: 0.9 }, sourceWidth: 20, sourceHeight: 20, mirrorDisplay: false,
  });
  return calls;
}

describe('Same Space final segmented output', () => {
  it('does not draw a raw frame when no segmented frame exists', () => {
    assert.equal(drawLayer(null).filter((call) => call.name === 'draw').length, 0);
  });

  it('keeps a source transparent before its first successful segmentation', () => {
    const { output } = fakeOutput();
    assert.equal(drawLayer(output).filter((call) => call.name === 'draw').length, 0);
  });

  it('keeps the last valid final canvas when a later inference is invalid', () => {
    const { output } = fakeOutput();
    assert.equal(commitSegmentedSourceOutput(output, result()), true);
    assert.equal(commitSegmentedSourceOutput(output, result(false)), false);
    assert.equal(output.revision, 1);
  });

  it('keeps local and remote final canvases independent', () => {
    const local = fakeOutput().output;
    const remote = fakeOutput().output;
    commitSegmentedSourceOutput(local, result());
    assert.equal(local.revision, 1);
    assert.equal(remote.revision, 0);
    assert.notEqual(local.canvas, remote.canvas);
  });

  it('commits RGB then alpha masking before incrementing the final revision', () => {
    const { output, calls } = fakeOutput();
    assert.equal(commitSegmentedSourceOutput(output, result()), true);
    assert.deepEqual(calls.filter((call) => call.name === 'draw').map((call) => call.source), [output.rgbCanvas, output.alphaCanvas]);
    assert.equal(output.revision, 1);
  });

  it('restores source-over after alpha composition', () => {
    const { output } = fakeOutput();
    commitSegmentedSourceOutput(output, result());
    assert.equal(output.context.globalCompositeOperation, 'source-over');
  });

  it('accepts only final canvas output as a compositor layer input', () => {
    const { output } = fakeOutput();
    commitSegmentedSourceOutput(output, result());
    const calls = drawLayer(output);
    assert.deepEqual(calls.filter((call) => call.name === 'draw').map((call) => call.source), [output.canvas]);
  });

  it('rejects stale generation results before they can commit', () => {
    const { output } = fakeOutput(2);
    assert.equal(commitSegmentedSourceOutput(output, result(), 1), false);
    assert.equal(output.revision, 0);
  });

  it('starts a re-entered Same Space source with no prior canvas revision', () => {
    const previous = fakeOutput().output;
    commitSegmentedSourceOutput(previous, result());
    const reentered = fakeOutput().output;
    assert.equal(previous.revision, 1);
    assert.equal(drawLayer(reentered).filter((call) => call.name === 'draw').length, 0);
  });

  it('marks foreground stale and reconnecting after budgets', () => {
    assert.equal(isForegroundStale(0, 1000), true);
    assert.equal(isForegroundStale(1000, 1000 + SAME_SPACE_FOREGROUND_STALE_MS - 1), false);
    assert.equal(isForegroundStale(1000, 1000 + SAME_SPACE_FOREGROUND_STALE_MS), true);
    assert.equal(isForegroundReconnecting(1000, 1000 + SAME_SPACE_FOREGROUND_RECONNECTING_MS - 1), false);
    assert.equal(isForegroundReconnecting(1000, 1000 + SAME_SPACE_FOREGROUND_RECONNECTING_MS), true);
  });

  it('keeps last cutout on stale instead of painting raw video in production', () => {
    const { output } = fakeOutput();
    commitSegmentedSourceOutput(output, result());
    output.canvas.width = 2;
    output.canvas.height = 2;
    const rawVideo = { videoWidth: 20, videoHeight: 20 } as HTMLVideoElement;
    const calls: Call[] = [];
    drawSameSpacePersonLayer(fakeContext(calls) as unknown as CanvasRenderingContext2D, 100, 100, {
      slot: 'right',
      output,
      bounds: { minX: 0.1, minY: 0.1, maxX: 0.8, maxY: 0.9 },
      sourceWidth: 20,
      sourceHeight: 20,
      mirrorDisplay: false,
      rawVideo,
      preferRawVideo: true,
      allowDebugRawVideo: false,
      showReconnecting: true,
    });
    const draws = calls.filter((call) => call.name === 'draw');
    assert.equal(draws.length, 1);
    assert.equal(draws[0]!.source, output.canvas);
    assert.ok(calls.some((call) => call.name === 'fillText'));
  });

  it('DEV debug can paint raw only when allowDebugRawVideo is true', () => {
    const { output } = fakeOutput();
    commitSegmentedSourceOutput(output, result());
    output.canvas.width = 2;
    output.canvas.height = 2;
    const rawVideo = { videoWidth: 20, videoHeight: 20 } as HTMLVideoElement;
    const calls: Call[] = [];
    drawSameSpacePersonLayer(fakeContext(calls) as unknown as CanvasRenderingContext2D, 100, 100, {
      slot: 'right',
      output,
      bounds: { minX: 0.1, minY: 0.1, maxX: 0.8, maxY: 0.9 },
      sourceWidth: 20,
      sourceHeight: 20,
      mirrorDisplay: false,
      rawVideo,
      preferRawVideo: true,
      allowDebugRawVideo: true,
    });
    assert.equal(canDrawSameSpaceRawVideo({ allowDebugRawVideo: true, preferRawVideo: true, rawVideo }), true);
    assert.equal(calls.filter((call) => call.name === 'draw')[0]?.source, rawVideo);
  });

  it('local missing foreground does not block remote cutout draw', () => {
    const { output } = fakeOutput();
    commitSegmentedSourceOutput(output, result());
    output.canvas.width = 2;
    output.canvas.height = 2;
    const leftCalls: Call[] = [];
    const rightCalls: Call[] = [];
    drawSameSpacePersonLayer(fakeContext(leftCalls) as unknown as CanvasRenderingContext2D, 100, 100, {
      slot: 'left',
      output: null,
      bounds: null,
      sourceWidth: 0,
      sourceHeight: 0,
      mirrorDisplay: false,
      showLoadingSilhouette: true,
    });
    drawSameSpacePersonLayer(fakeContext(rightCalls) as unknown as CanvasRenderingContext2D, 100, 100, {
      slot: 'right',
      output,
      bounds: { minX: 0.1, minY: 0.1, maxX: 0.8, maxY: 0.9 },
      sourceWidth: 20,
      sourceHeight: 20,
      mirrorDisplay: false,
    });
    assert.equal(leftCalls.filter((call) => call.name === 'draw').length, 0);
    assert.equal(rightCalls.filter((call) => call.name === 'draw')[0]?.source, output.canvas);
  });
});
