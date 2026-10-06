import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareUserIdsCanonical,
  compositionSlotForUserId,
  orderedDrawSlots,
  resolvePersonCenterX,
  SAME_SPACE_HOME_CENTER_X,
  SAME_SPACE_OVERLAP_CORRIDOR,
  SAME_SPACE_CENTROID_ASSIST_MAX,
  destinationCrossesMidline,
  computeSameSpaceMotionOffsetX,
  computeDampedCentroidAssistX,
  mapCentroidToStageCenterX,
} from './sameSpaceLayoutSpec';
import {
  computeSameSpacePersonPlacement,
  defaultPersonBounds,
  isValidPersonBounds,
  smoothPersonBounds,
} from './sameSpaceComposition';

describe('sameSpaceLayoutSpec slots', () => {
  it('assigns stable left/right from sorted member ids, not creator role', () => {
    const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    assert.equal(compareUserIdsCanonical(a, b) < 0, true);
    assert.equal(compositionSlotForUserId(a, a, b), 'left');
    assert.equal(compositionSlotForUserId(b, a, b), 'right');
    assert.equal(compositionSlotForUserId(a, b, a), 'left');
    assert.equal(compositionSlotForUserId(b, b, a), 'right');
    assert.equal(compositionSlotForUserId(a, b, a), compositionSlotForUserId(a, a, b));
  });

  it('keeps default centers near 30% / 70% with overlap corridor access', () => {
    assert.equal(SAME_SPACE_HOME_CENTER_X.left, 0.43);
    assert.equal(SAME_SPACE_HOME_CENTER_X.right, 0.57);
    const leftTowardCenter = resolvePersonCenterX(
      'left',
      0,
      'half',
      2,
      SAME_SPACE_OVERLAP_CORRIDOR.maxX - SAME_SPACE_HOME_CENTER_X.left,
    );
    const rightTowardCenter = resolvePersonCenterX(
      'right',
      0,
      'half',
      2,
      SAME_SPACE_OVERLAP_CORRIDOR.minX - SAME_SPACE_HOME_CENTER_X.right,
    );
    assert.ok(leftTowardCenter >= SAME_SPACE_OVERLAP_CORRIDOR.minX);
    assert.ok(rightTowardCenter <= SAME_SPACE_OVERLAP_CORRIDOR.maxX);
    assert.ok(resolvePersonCenterX('left', -1) < 0.43);
    assert.ok(resolvePersonCenterX('right', 1) > 0.57);
  });

  it('supports solo center layout without forcing it', () => {
    assert.equal(resolvePersonCenterX('left', 0, 'half', 1), 0.43);
    assert.ok(Math.abs(resolvePersonCenterX('left', 0, 'center', 1) - 0.5) < 0.001);
  });

  it('orders draw slots from front preference', () => {
    assert.deepEqual(orderedDrawSlots('left'), ['right', 'left']);
    assert.deepEqual(orderedDrawSlots('right'), ['left', 'right']);
  });

  it('damps automatic centroid assist to a small stage fraction', () => {
    const assist = computeDampedCentroidAssistX('left', 0.9, false);
    assert.ok(Math.abs(assist) <= SAME_SPACE_CENTROID_ASSIST_MAX + 1e-9);
    assert.ok(assist > 0);
    const stopped = computeDampedCentroidAssistX('left', 0.9, false, {
      left: false,
      right: true,
      top: false,
      bottom: false,
    });
    assert.equal(stopped, 0);
    const mapped = mapCentroidToStageCenterX('left', 0.9, false);
    assert.ok(mapped < 0.52, `assist must not drag home across stage, got ${mapped}`);
  });
});

describe('sameSpaceComposition placement', () => {
  it('places left person left of right person on soft anchors', () => {
    const left = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: { minX: 0.2, minY: 0.1, maxX: 0.8, maxY: 0.95 },
      slot: 'left',
    });
    const right = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: { minX: 0.2, minY: 0.1, maxX: 0.8, maxY: 0.95 },
      slot: 'right',
    });

    assert.ok(left.anchor.x < right.anchor.x);
    assert.ok(Math.abs(left.anchor.x / 1000 - 0.43) < 0.08);
    assert.ok(Math.abs(right.anchor.x / 1000 - 0.57) < 0.08);
    assert.equal(left.sourceCrop.x, 0);
    assert.equal(left.sourceCrop.y, 0);
    assert.equal(left.sourceCrop.width, 720);
    assert.equal(left.sourceCrop.height, 1280);
    assert.ok(left.personDest.height > 750 * 0.5);
  });

  it('allows overlap into the corridor without hard 50% clipping', () => {
    const left = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      slot: 'left',
      motionOffsetX: SAME_SPACE_OVERLAP_CORRIDOR.maxX - SAME_SPACE_HOME_CENTER_X.left,
    });
    assert.ok(left.personDest.x + left.personDest.width > 500);
    assert.ok(left.anchor.x > 500 || destinationCrossesMidline(left.dest, 1000));
  });

  it('applies mild centroid assist without dominating camera motion', () => {
    const base = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      slot: 'left',
    });
    const motioned = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      slot: 'left',
      motionOffsetX: computeSameSpaceMotionOffsetX(0.8),
    });
    assert.ok(motioned.anchor.x > base.anchor.x);
    assert.ok(motioned.anchor.x - base.anchor.x < 1000 * 0.1);
  });

  it('does not auto-expand a solo person to full width', () => {
    const bounds = defaultPersonBounds();
    const solo = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: bounds,
      slot: 'left',
      participantCount: 1,
      soloLayout: 'half',
    });
    assert.ok(solo.personDest.width <= 1000 * 0.42);
    assert.ok(Math.abs(solo.anchor.x / 1000 - 0.43) < 0.1);
  });

  it('rejects tiny/invalid bounds and smooths bbox jitter', () => {
    assert.equal(isValidPersonBounds({ minX: 0.4, minY: 0.4, maxX: 0.41, maxY: 0.41 }), false);
    assert.equal(isValidPersonBounds(defaultPersonBounds()), true);
    const smoothed = smoothPersonBounds(
      { minX: 0.2, minY: 0.2, maxX: 0.8, maxY: 0.9 },
      { minX: 0.3, minY: 0.1, maxX: 0.9, maxY: 0.95 },
      0.5,
    );
    assert.ok(smoothed.minX > 0.2 && smoothed.minX < 0.3);
  });

  it('keeps full-frame source crop (bbox is layout-only)', () => {
    const placement = computeSameSpacePersonPlacement({
      canvasWidth: 1200,
      canvasHeight: 675,
      sourceWidth: 1080,
      sourceHeight: 1920,
      personBounds: { minX: 0.28, minY: 0.02, maxX: 0.72, maxY: 0.99 },
      slot: 'left',
    });
    assert.equal(placement.sourceCrop.width, 1080);
    assert.equal(placement.sourceCrop.height, 1920);
    const sourceAspect = placement.sourceCrop.width / placement.sourceCrop.height;
    const destAspect = placement.dest.width / placement.dest.height;
    assert.ok(Math.abs(sourceAspect - destAspect) < 0.001);
  });
});
