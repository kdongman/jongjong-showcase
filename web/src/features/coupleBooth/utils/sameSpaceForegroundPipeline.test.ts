import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commitSegmentedSourceOutput,
  createSegmentedSourceOutput,
  type SegmentedSourceOutput,
} from '../composition/sameSpaceCanvasRenderer';
import type { LiveSegmentResult } from '../segmentation/LivePersonSegmenter';
import { resolveSameSpaceLayerDisplay } from '../components/SameSpaceVideoStage';
import {
  resolveForegroundPlaceholderReason,
  resolveForegroundStatus,
  shouldShowWarmupPlaceholder,
} from './sameSpaceForegroundStatus';

const here = dirname(fileURLToPath(import.meta.url));

function fakeContext() {
  const puts: unknown[] = [];
  return {
    puts,
    globalCompositeOperation: 'source-over',
    save() {},
    restore() {},
    clearRect() {},
    drawImage() {},
    putImageData(data: unknown, _dx?: number, _dy?: number) {
      // Mimic Chromium: only accept objects that look like ImageData from createImageData.
      if (!data || typeof data !== 'object' || !('data' in (data as object))) {
        throw new TypeError('parameter 1 is not of type ImageData');
      }
      puts.push(data);
    },
    createImageData(width: number, height: number) {
      return { width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' };
    },
  };
}

function fakeOutput(generation = 1): SegmentedSourceOutput {
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  return {
    canvas,
    context: fakeContext() as unknown as CanvasRenderingContext2D,
    rgbCanvas: { width: 0, height: 0 } as HTMLCanvasElement,
    rgbContext: fakeContext() as unknown as CanvasRenderingContext2D,
    alphaCanvas: { width: 0, height: 0 } as HTMLCanvasElement,
    alphaContext: fakeContext() as unknown as CanvasRenderingContext2D,
    generation,
    revision: 0,
    contentRevision: 0,
    contentChecksum: 0,
    lastPixelWriteAtMs: 0,
    lastValidAtMs: 0,
  };
}

function segmentResult(fill = 40): LiveSegmentResult {
  const data = new Uint8ClampedArray(16);
  data.fill(fill);
  return {
    rgb: { width: 2, height: 2, data } as ImageData,
    mask: {
      width: 2,
      height: 2,
      alpha: new Uint8ClampedArray([255, 200, 180, 0]),
      bounds: { minX: 0.1, minY: 0.1, maxX: 0.9, maxY: 0.95 },
      valid: true,
    },
    sourceWidth: 640,
    sourceHeight: 480,
    inferWidth: 2,
    inferHeight: 2,
    sourceKey: 'local',
  };
}

describe('sameSpace foreground commit ImageData contract', () => {
  it('commits through createImageData so putImageData accepts the payload', () => {
    const output = fakeOutput(3);
    const ok = commitSegmentedSourceOutput(output, segmentResult(90), 3);
    assert.equal(ok, true);
    assert.ok(output.revision > 0);
    assert.ok(output.contentRevision > 0);
    assert.ok((output.rgbContext as unknown as { puts: unknown[] }).puts.length >= 1);
  });

  it('fails closed when putImageData rejects non-ImageData payloads', () => {
    const output = fakeOutput(4);
    const broken = fakeContext();
    broken.putImageData = () => {
      throw new TypeError('parameter 1 is not of type ImageData');
    };
    output.rgbContext = broken as unknown as CanvasRenderingContext2D;
    const ok = commitSegmentedSourceOutput(output, segmentResult(90), 4);
    assert.equal(ok, false);
    assert.equal(output.revision, 0);
  });
});

describe('sameSpace foreground readiness independence', () => {
  it('shows local silhouette without requiring remote readiness', () => {
    const local = resolveSameSpaceLayerDisplay({
      hasCommittedForeground: false,
      foregroundFresh: false,
      reconnecting: false,
      rawUsable: true,
      allowDebugRawVideo: false,
      hasRemoteExpectation: true,
      status: 'warmingUp',
    });
    assert.equal(local.showLoadingSilhouette, true);

    const localReady = resolveSameSpaceLayerDisplay({
      hasCommittedForeground: true,
      foregroundFresh: true,
      reconnecting: false,
      rawUsable: true,
      allowDebugRawVideo: false,
      hasRemoteExpectation: true,
      status: 'ready',
    });
    assert.equal(localReady.showLoadingSilhouette, false);

    const remoteWaiting = resolveSameSpaceLayerDisplay({
      hasCommittedForeground: false,
      foregroundFresh: false,
      reconnecting: false,
      rawUsable: false,
      allowDebugRawVideo: false,
      hasRemoteExpectation: false,
      status: 'waitingForTrack',
    });
    assert.equal(remoteWaiting.showLoadingSilhouette, false);
  });

  it('never returns to warmup silhouette after first commit', () => {
    const recovering = resolveSameSpaceLayerDisplay({
      hasCommittedForeground: true,
      foregroundFresh: false,
      reconnecting: true,
      rawUsable: true,
      allowDebugRawVideo: false,
      hasRemoteExpectation: true,
      status: 'recovering',
    });
    assert.equal(recovering.showLoadingSilhouette, false);
    assert.equal(recovering.showReconnecting, true);
    assert.equal(shouldShowWarmupPlaceholder('ready'), false);
    assert.equal(shouldShowWarmupPlaceholder('recovering'), false);
  });

  it('classifies placeholder reasons without background/position gates', () => {
    assert.equal(
      resolveForegroundPlaceholderReason({
        status: 'warmingUp',
        hasTrackOrExpectation: true,
        videoReady: true,
        hasCommittedForeground: false,
        canvasPresent: true,
        generationMatch: true,
      }),
      'NO_SEGMENT_COMMIT',
    );
    assert.equal(resolveForegroundStatus({
      hasTrackOrExpectation: true,
      videoReady: true,
      hasCommittedForeground: true,
      reconnecting: false,
      consecutiveFailures: 0,
    }), 'ready');
  });
});

describe('sameSpace pipeline lifecycle guards', () => {
  it('does not remount SameSpaceVideoStage on background key changes', () => {
    const page = readFileSync(join(here, '../pages/BoothSessionPage.tsx'), 'utf8');
    assert.doesNotMatch(page, /SameSpaceVideoStage[\s\S]{0,200}key=\{[^}]*background/);
    assert.doesNotMatch(page, /key=\{`\$\{[^`]*sameSpaceEnabled/);
    assert.match(page, /background=\{sameSpaceMeta\.background\}/);
  });

  it('keeps background props out of the media pipeline effect deps', () => {
    const stage = readFileSync(join(here, '../components/SameSpaceVideoStage.tsx'), 'utf8');
    const renderer = readFileSync(join(here, '../composition/sameSpaceCanvasRenderer.ts'), 'utf8');
    // Pipeline effect intentionally omits background — compositionRef carries it.
    assert.match(stage, /compositionRef\.current\.background = background/);
    assert.match(stage, /Intentionally omit hasRemoteTrack \/ partnerId \/ background/);
    assert.doesNotMatch(stage, /disposeLiveSegmenter\(\);\s*[\s\S]{0,80}background/);
    assert.match(renderer, /createImageData/);
    assert.match(renderer, /rgb putImageData failed/);
  });

  it('preserves segmented output canvas identity across successive commits', () => {
    const output = createSegmentedSourceOutput(1);
    // Node may lack document — skip soft when create returns null.
    if (!output) {
      assert.ok(true);
      return;
    }
    const canvasA = output.canvas;
    commitSegmentedSourceOutput(output, segmentResult(50), 1);
    const canvasB = output.canvas;
    commitSegmentedSourceOutput(output, segmentResult(80), 1);
    assert.equal(canvasA, canvasB);
    assert.equal(output.revision >= 1, true);
  });
});
