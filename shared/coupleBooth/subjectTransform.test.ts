import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFitScaleLockState,
  FIT_SCALE_HYSTERESIS,
  FIT_SCALE_LOCK_SAMPLES,
  FIT_SCALE_REACQUIRE_MS,
  resolveFitPersonHeightNorm,
  updateFitScaleLock,
} from './sameSpaceFitScale';
import { computeSameSpacePersonPlacement, defaultPersonBounds } from './sameSpaceComposition';
import {
  clampManualOffset,
  SAME_SPACE_MANUAL_SCALE_CLAMP,
} from './sameSpaceLayoutSpec';
import {
  clampSubjectTransform,
  manualFromSubjectTransform,
  scaleSubjectAboutAnchor,
  SUBJECT_SCALE_MAX,
  SUBJECT_SCALE_MIN,
  subjectTransformFromManual,
} from './subjectTransform';
import {
  BOOTH_EXPORT_SCALE,
  computeSameSpaceStripLayout,
} from './layout';
import {
  BOOTH_SCENE_LOGICAL_HEIGHT,
  BOOTH_SCENE_LOGICAL_WIDTH,
} from './boothSceneSpec';

describe('subjectTransform', () => {
  it('clamps scale without stretching axes independently', () => {
    assert.equal(clampSubjectTransform({ x: 0, y: 0, scale: 0.01 }).scale, SUBJECT_SCALE_MIN);
    assert.equal(clampSubjectTransform({ x: 0, y: 0, scale: 99 }).scale, SUBJECT_SCALE_MAX);
    const scaled = scaleSubjectAboutAnchor({
      current: { offsetX: 0.1, offsetY: -0.05, scale: 1, mode: 'auto' },
      anchorX: 0.5,
      anchorY: 0.5,
      nextScale: 2,
    });
    assert.equal(scaled.scale, 2);
    assert.equal(scaled.offsetX, 0.1);
    assert.equal(scaled.offsetY, -0.05);
    assert.equal(scaled.mode, 'manual');
  });

  it('round-trips with Same Space manual offsets', () => {
    const manual = clampManualOffset({ offsetX: 0.12, offsetY: -0.08, scale: 1.4 });
    const subject = subjectTransformFromManual(manual);
    assert.deepEqual(manualFromSubjectTransform(subject), {
      offsetX: manual.offsetX,
      offsetY: manual.offsetY,
      scale: manual.scale,
      mode: manual.mode ?? 'auto',
    });
    assert.equal(SAME_SPACE_MANUAL_SCALE_CLAMP.scaleMin, SUBJECT_SCALE_MIN);
    assert.equal(SAME_SPACE_MANUAL_SCALE_CLAMP.scaleMax, SUBJECT_SCALE_MAX);
  });

  it('keeps draw rect aspect ratio when scale changes', () => {
    const base = computeSameSpacePersonPlacement({
      canvasWidth: 600,
      canvasHeight: 900,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      manualOffset: { offsetX: 0, offsetY: 0, scale: 1 },
      slot: 'left',
      participantCount: 2,
    });
    const zoomed = computeSameSpacePersonPlacement({
      canvasWidth: 600,
      canvasHeight: 900,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      manualOffset: { offsetX: 0, offsetY: 0, scale: 2 },
      slot: 'left',
      participantCount: 2,
    });
    const baseAspect = base.dest.width / base.dest.height;
    const zoomAspect = zoomed.dest.width / zoomed.dest.height;
    assert.ok(Math.abs(baseAspect - zoomAspect) < 1e-9);
    assert.ok(zoomed.dest.width > base.dest.width);
    assert.ok(zoomed.personDest.height > base.personDest.height);
  });

  it('keeps normalized composition across viewport sizes', () => {
    const manual = { offsetX: 0.2, offsetY: -0.1, scale: 1.25 };
    const small = computeSameSpacePersonPlacement({
      canvasWidth: 300,
      canvasHeight: 450,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      manualOffset: manual,
      slot: 'right',
      participantCount: 2,
    });
    const large = computeSameSpacePersonPlacement({
      canvasWidth: 1200,
      canvasHeight: 1800,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      manualOffset: manual,
      slot: 'right',
      participantCount: 2,
    });
    const smallCx = (small.personDest.x + small.personDest.width / 2) / 300;
    const largeCx = (large.personDest.x + large.personDest.width / 2) / 1200;
    assert.ok(Math.abs(smallCx - largeCx) < 0.02);
  });
});

describe('sameSpaceFitScale', () => {
  const tall = { minX: 0.2, minY: 0.1, maxX: 0.8, maxY: 0.95 };
  const noisy = { minX: 0.2, minY: 0.1, maxX: 0.8, maxY: 0.97 };

  it('ignores small bbox noise after lock', () => {
    let state = createFitScaleLockState();
    for (let i = 0; i < FIT_SCALE_LOCK_SAMPLES; i += 1) {
      state = updateFitScaleLock(state, tall, i * 16);
    }
    assert.ok(state.lockedHeightNorm != null);
    const locked = state.lockedHeightNorm!;
    const next = updateFitScaleLock(state, noisy, 10_000);
    const delta = Math.abs((noisy.maxY - noisy.minY) - locked) / locked;
    assert.ok(delta < FIT_SCALE_HYSTERESIS || Math.abs(next.lockedHeightNorm! - locked) < 1e-9
      || Math.abs(next.lockedHeightNorm! - locked) / locked <= 0.03);
    const height = resolveFitPersonHeightNorm(next, noisy);
    assert.ok(height != null);
    assert.ok(Math.abs(height! - locked) / locked < FIT_SCALE_HYSTERESIS + 0.01);
  });

  it('reinitializes only after a sustained miss', () => {
    let state = createFitScaleLockState();
    for (let i = 0; i < FIT_SCALE_LOCK_SAMPLES; i += 1) {
      state = updateFitScaleLock(state, tall, i * 16);
    }
    assert.ok(state.lockedHeightNorm != null);
    state = updateFitScaleLock(state, null, 1000);
    assert.ok(state.lockedHeightNorm != null);
    state = updateFitScaleLock(state, null, 1000 + FIT_SCALE_REACQUIRE_MS);
    assert.equal(state.lockedHeightNorm, null);
    assert.equal(state.sampleCount, 0);
  });

  it('separates fit height from live bbox used for feet', () => {
    const lockedHeight = 0.7;
    const live = { minX: 0.25, minY: 0.05, maxX: 0.75, maxY: 0.99 };
    const withLock = computeSameSpacePersonPlacement({
      canvasWidth: 1200,
      canvasHeight: 900,
      sourceWidth: 640,
      sourceHeight: 480,
      personBounds: live,
      fitPersonHeightNorm: lockedHeight,
      disableEdgeScaleDamp: true,
      slot: 'left',
      participantCount: 2,
    });
    const without = computeSameSpacePersonPlacement({
      canvasWidth: 1200,
      canvasHeight: 900,
      sourceWidth: 640,
      sourceHeight: 480,
      personBounds: live,
      slot: 'left',
      participantCount: 2,
    });
    // Smaller locked height → larger fit scale than the taller live bbox.
    assert.ok(withLock.dest.height > without.dest.height);
    // Footprint still tracks live bbox proportions on the sprite.
    assert.ok(withLock.personDest.height > 0);
  });
});

describe('export dimensions', () => {
  it('renders logical scenes at exportScale 2 with shared 4:3 cells', () => {
    const one = computeSameSpaceStripLayout('one_cell', {
      exportScale: BOOTH_EXPORT_SCALE,
      useLogicalScene: true,
    });
    const two = computeSameSpaceStripLayout('two_cell', {
      exportScale: BOOTH_EXPORT_SCALE,
      useLogicalScene: true,
    });
    assert.equal(one.logicalCellWidth, BOOTH_SCENE_LOGICAL_WIDTH);
    assert.equal(one.logicalCellHeight, BOOTH_SCENE_LOGICAL_HEIGHT);
    assert.equal(one.cellWidth, BOOTH_SCENE_LOGICAL_WIDTH * BOOTH_EXPORT_SCALE);
    assert.equal(one.cellHeight, BOOTH_SCENE_LOGICAL_HEIGHT * BOOTH_EXPORT_SCALE);
    assert.equal(two.logicalCellWidth, BOOTH_SCENE_LOGICAL_WIDTH);
    assert.equal(two.logicalCellHeight, BOOTH_SCENE_LOGICAL_HEIGHT);
    assert.equal(two.cellWidth, BOOTH_SCENE_LOGICAL_WIDTH * BOOTH_EXPORT_SCALE);
    assert.equal(two.cellHeight, BOOTH_SCENE_LOGICAL_HEIGHT * BOOTH_EXPORT_SCALE);
    assert.equal(one.width, two.width);
    assert.equal(one.height, two.height);
    assert.equal(BOOTH_EXPORT_SCALE, 2);
  });
});
