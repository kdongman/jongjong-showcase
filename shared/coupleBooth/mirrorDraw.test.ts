import assert from 'node:assert/strict';
import test from 'node:test';
import {
  drawImageMaybeMirrored,
  pixelsAreMirrored,
  sameSpaceCutoutMirrorMeta,
  shouldApplyCanvasMirror,
} from './mirrorDraw';

test('shouldApplyCanvasMirror applies only when mirrorX and pixels are unmirrored', () => {
  assert.equal(shouldApplyCanvasMirror({ mirrorX: true, pixelsMirrored: false }), true);
  assert.equal(shouldApplyCanvasMirror({ mirrorX: true, mirrorBakedIntoAsset: false }), true);
  assert.equal(shouldApplyCanvasMirror({ mirrorX: true, mirrorBakedIntoAsset: true }), false);
  assert.equal(shouldApplyCanvasMirror({ mirrorX: false, pixelsMirrored: false }), false);
  assert.equal(shouldApplyCanvasMirror({ mirrorX: true, pixelsMirrored: true }), false);
});

test('pixelsMirrored alias wins over mirrorBakedIntoAsset', () => {
  assert.equal(
    pixelsAreMirrored({ pixelsMirrored: false, mirrorBakedIntoAsset: true }),
    false,
  );
  assert.equal(
    shouldApplyCanvasMirror({
      mirrorX: true,
      pixelsMirrored: false,
      mirrorBakedIntoAsset: true,
    }),
    true,
  );
});

test('sameSpaceCutoutMirrorMeta never claims baked pixels', () => {
  const meta = sameSpaceCutoutMirrorMeta(true);
  assert.equal(meta.mirrorX, true);
  assert.equal(meta.pixelsMirrored, false);
  assert.equal(meta.mirrorBakedIntoAsset, false);
  assert.equal(shouldApplyCanvasMirror(meta), true);
  assert.equal(shouldApplyCanvasMirror(sameSpaceCutoutMirrorMeta(false)), false);
});

test('drawImageMaybeMirrored flips once around destination center', () => {
  const calls: Array<{ op: string; args: number[] }> = [];
  const ctx = {
    save: () => calls.push({ op: 'save', args: [] }),
    restore: () => calls.push({ op: 'restore', args: [] }),
    translate: (x: number, y: number) => calls.push({ op: 'translate', args: [x, y] }),
    scale: (x: number, y: number) => calls.push({ op: 'scale', args: [x, y] }),
    drawImage: (...args: number[]) => calls.push({ op: 'drawImage', args: args as number[] }),
  } as unknown as CanvasRenderingContext2D;

  drawImageMaybeMirrored(
    ctx,
    {} as CanvasImageSource,
    0, 0, 10, 20,
    100, 50, 40, 80,
    { mirrorX: true, pixelsMirrored: false },
  );

  assert.deepEqual(
    calls.map((c) => c.op),
    ['save', 'translate', 'scale', 'translate', 'drawImage', 'restore'],
  );
  assert.deepEqual(calls[1]!.args, [120, 0]); // centerX = 100 + 40/2
  assert.deepEqual(calls[2]!.args, [-1, 1]);
  assert.deepEqual(calls[3]!.args, [-120, 0]);
});

test('drawImageMaybeMirrored skips flip when pixels already mirrored', () => {
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: () => calls.push('translate'),
    scale: () => calls.push('scale'),
    drawImage: () => calls.push('drawImage'),
  } as unknown as CanvasRenderingContext2D;

  drawImageMaybeMirrored(
    ctx,
    {} as CanvasImageSource,
    0, 0, 10, 20,
    0, 0, 40, 80,
    { mirrorX: true, mirrorBakedIntoAsset: true },
  );
  assert.deepEqual(calls, ['drawImage']);
});
