import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeSameSpaceMotionOffsetX,
  destinationCrossesMidline,
  resolvePersonCenterX,
  SAME_SPACE_HOME_CENTER_X,
  compositionSlotForUserId,
} from '@shared/sameSpaceLayoutSpec';
import { computeSameSpacePersonPlacement, defaultPersonBounds } from '@shared/sameSpaceComposition';
import {
  advanceCompositorDrawState,
  compositorSatisfiesCaptureRequest,
  createEmptyCompositorDrawState,
  recordCaptureRequest,
  resolveActiveForegroundOutput,
  waitForCompositorCaptureReady,
} from './sameSpaceLiveCapture';

const here = dirname(fileURLToPath(import.meta.url));

describe('Same Space unified preview/capture', () => {
  it('uses the same compositor draw gate for capture readiness', () => {
    const draw = advanceCompositorDrawState(createEmptyCompositorDrawState(), 4, 7, 100);
    const request = recordCaptureRequest({ localCommitVersion: 4, remoteCommitVersion: 7 }, true, 90);
    assert.equal(compositorSatisfiesCaptureRequest(draw, request), true);
    assert.equal(
      compositorSatisfiesCaptureRequest(draw, recordCaptureRequest({ localCommitVersion: 5, remoteCommitVersion: 7 }, true)),
      false,
    );
  });

  it('can require the first compositor frame containing an imperative shutter presentation', () => {
    const before = advanceCompositorDrawState(createEmptyCompositorDrawState(), 4, 7, 100);
    const request = recordCaptureRequest(
      { localCommitVersion: 4, remoteCommitVersion: 7 },
      true,
      101,
      before.compositeGeneration + 1,
    );
    assert.equal(compositorSatisfiesCaptureRequest(before, request), false);
    const shutterFrame = advanceCompositorDrawState(before, 4, 7, 116);
    assert.equal(compositorSatisfiesCaptureRequest(shutterFrame, request), true);
  });

  it('does not treat a separate raw-video capture path as ready without draw', () => {
    const empty = createEmptyCompositorDrawState();
    const request = recordCaptureRequest({ localCommitVersion: 1, remoteCommitVersion: 1 }, true);
    assert.equal(compositorSatisfiesCaptureRequest(empty, request), false);
  });

  it('advances drawVersion when commit versions increase', () => {
    let state = createEmptyCompositorDrawState();
    state = advanceCompositorDrawState(state, 1, 1, 10);
    assert.equal(state.localDrawnVersion, 1);
    assert.equal(state.remoteDrawnVersion, 1);
    assert.equal(state.compositeGeneration, 1);
    state = advanceCompositorDrawState(state, 2, 5, 20);
    assert.equal(state.localDrawnVersion, 2);
    assert.equal(state.remoteDrawnVersion, 5);
    assert.equal(state.compositeGeneration, 2);
  });

  it('drops stale canvas references from a previous output generation', () => {
    const stale = { generation: 1, revision: 9 };
    const live = { generation: 2, revision: 1 };
    assert.equal(resolveActiveForegroundOutput(stale, 2), null);
    assert.equal(resolveActiveForegroundOutput(live, 2), live);
  });

  it('waits until compositor draw catches the requested generation', async () => {
    let draw = createEmptyCompositorDrawState();
    const request = recordCaptureRequest({ localCommitVersion: 3, remoteCommitVersion: 2 }, true, 0);
    let ticks = 0;
    const ready = waitForCompositorCaptureReady({
      getDrawState: () => draw,
      request,
      timeoutMs: 500,
      pollMs: 5,
      now: () => ticks * 5,
      schedule: (fn) => {
        ticks += 1;
        if (ticks === 3) draw = advanceCompositorDrawState(draw, 3, 2, ticks * 5);
        queueMicrotask(fn);
        return ticks;
      },
      cancel: () => undefined,
    });
    await ready;
    assert.equal(draw.localDrawnVersion, 3);
    assert.equal(draw.remoteDrawnVersion, 2);
  });

  it('capture helpers wait for compositor then prefer full-res video cutout', () => {
    const captureSource = readFileSync(join(here, 'sameSpaceLiveCapture.ts'), 'utf8');
    assert.match(captureSource, /snapshotAuthoritativeComposite/);
    assert.match(captureSource, /captureHighResPersonCutoutFromVideo/);
    assert.match(captureSource, /getLocalVideo/);
    assert.doesNotMatch(captureSource, /captureLocalFrame/);
    const syncSource = readFileSync(
      join(here, '../hooks/useSynchronizedCapture.ts'),
      'utf8',
    );
    assert.match(syncSource, /captureWysiwyg/);
    assert.match(syncSource, /SAME_SPACE_CAPTURE_HANDLE_MISSING/);
    assert.doesNotMatch(syncSource, /createPersonCutout/);
    const hiSource = readFileSync(join(here, 'highResCutoutCapture.ts'), 'utf8');
    assert.match(hiSource, /createPersonCutout/);
    assert.match(hiSource, /videoWidth/);
    assert.doesNotMatch(hiSource, /LIVE_SEGMENT_LONG_EDGE/);
  });
});

describe('Same Space shared stage layout (no half clip)', () => {
  it('places destination rects that can enter the opposite half', () => {
    const left = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      slot: 'left',
      motionOffsetX: 0.28,
    });
    const centerX = left.anchor.x;
    assert.ok(centerX > 500, `expected center past midline, got ${centerX}`);
    assert.ok(left.personDest.x + left.personDest.width > 500);
  });

  it('has no ctx.clip half-slot pattern in the live person drawer', () => {
    const renderer = readFileSync(join(here, 'sameSpaceCanvasRenderer.ts'), 'utf8');
    assert.doesNotMatch(renderer, /ctx\.clip\s*\(/);
    assert.doesNotMatch(renderer, /slotWidth|halfWidth|max-width:\s*50%/);
    assert.match(renderer, /Never clip to a left\/right half/);
  });

  it('allows two foreground destination rects to overlap', () => {
    const left = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: { minX: 0.15, minY: 0.1, maxX: 0.85, maxY: 0.95 },
      slot: 'left',
      motionOffsetX: 0.12,
    });
    const right = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: { minX: 0.15, minY: 0.1, maxX: 0.85, maxY: 0.95 },
      slot: 'right',
      motionOffsetX: -0.12,
    });
    const leftRight = left.personDest.x + left.personDest.width;
    const rightLeft = right.personDest.x;
    assert.ok(leftRight > rightLeft);
  });

  it('does not use participant overflow/50% clipping in Same Space live CSS', () => {
    const css = readFileSync(join(here, '../../../index.css'), 'utf8');
    const liveBlock = css.slice(css.indexOf('.same-space-live-stage'), css.indexOf('.card:has(.same-space-live-stage) .same-space-live-stage'));
    assert.doesNotMatch(liveBlock, /max-width:\s*50%/);
    assert.doesNotMatch(liveBlock, /clip-path\s*:/);
    assert.doesNotMatch(liveBlock, /grid-template-columns:\s*1fr\s+1fr/);
  });

  it('maps centroid motion toward stage center with mild assist', () => {
    assert.ok(computeSameSpaceMotionOffsetX(0.7) > 0);
    assert.ok(computeSameSpaceMotionOffsetX(0.3) < 0);
    assert.equal(computeSameSpaceMotionOffsetX(0.5), 0);
    const moved = resolvePersonCenterX('left', 0, 'half', 2, computeSameSpaceMotionOffsetX(0.72));
    assert.ok(moved > SAME_SPACE_HOME_CENTER_X.left);
    assert.ok(moved - SAME_SPACE_HOME_CENTER_X.left <= 0.08);
  });

  it('keeps layout identical when host/guest roles swap', () => {
    const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    assert.equal(compositionSlotForUserId(a, a, b), compositionSlotForUserId(a, b, a));
    assert.equal(compositionSlotForUserId(b, a, b), compositionSlotForUserId(b, b, a));
    const leftAsHostA = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      slot: compositionSlotForUserId(a, a, b)!,
    });
    const leftAsHostB = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      slot: compositionSlotForUserId(a, b, a)!,
    });
    assert.deepEqual(leftAsHostA.dest, leftAsHostB.dest);
  });

  it('defaults anchors near 38/62 for close couple packing', () => {
    assert.equal(SAME_SPACE_HOME_CENTER_X.left, 0.43);
    assert.equal(SAME_SPACE_HOME_CENTER_X.right, 0.57);
    const left = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      slot: 'left',
    });
    assert.ok(Math.abs(left.anchor.x / 1000 - 0.43) < 0.08);
  });

  it('can produce destination rects that straddle the canvas midline', () => {
    const left = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: { minX: 0.05, minY: 0.05, maxX: 0.95, maxY: 0.98 },
      slot: 'left',
      motionOffsetX: 0.08,
    });
    assert.equal(destinationCrossesMidline(left.dest, 1000), true);
  });
});

describe('Same Space stage source wiring', () => {
  it('wires capture to the visible live canvas snapshot API', () => {
    const stage = readFileSync(join(here, '../components/SameSpaceVideoStage.tsx'), 'utf8');
    assert.match(stage, /snapshotAuthoritativeComposite/);
    assert.match(stage, /captureHandleRef/);
    assert.match(stage, /advanceCompositorDrawState/);
    assert.match(stage, /getLocalVideo/);
    assert.match(stage, /updateFitScaleLock|fitScale/);
    // High-res cutout lives in the capture helper, not inline in the stage.
    assert.doesNotMatch(stage, /createPersonCutout/);
  });

  it('keeps a stable rAF compositor that reads refs, not remounting on track presence', () => {
    const stage = readFileSync(join(here, '../components/SameSpaceVideoStage.tsx'), 'utf8');
    assert.match(stage, /requestAnimationFrame\(render\)/);
    assert.match(stage, /compositionRef/);
    assert.doesNotMatch(stage, /hasRemoteTrack,\s*\n\s*partnerId/);
  });
});
