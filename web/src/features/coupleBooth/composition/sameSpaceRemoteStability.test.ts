import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAME_SPACE_HOME_CENTER_X,
  SAME_SPACE_MOTION_ENVELOPE,
  SAME_SPACE_OVERLAP_CORRIDOR,
  mapCentroidToStageCenterX,
  resolvePersonCenterX,
  resolveSessionParticipantSlots,
  destinationCrossesMidline,
} from '@shared/sameSpaceLayoutSpec';
import { computeSameSpacePersonPlacement, defaultPersonBounds } from '@shared/sameSpaceComposition';
import {
  decideSourceRecovery,
  ENQUEUE_STALE_MS,
} from '../segmentation/sourceLivenessHeartbeat';
import { decideVideoFrameAccept } from '../segmentation/videoFramePump';
import {
  commitSegmentedSourceOutput,
  computeForegroundContentChecksum,
  type SegmentedSourceOutput,
} from './sameSpaceCanvasRenderer';
import type { LiveSegmentResult } from '../segmentation/LivePersonSegmenter';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function fakeContext() {
  let composite = 'source-over';
  return {
    get globalCompositeOperation() { return composite; },
    set globalCompositeOperation(value: string) { composite = value; },
    save() {},
    restore() {},
    clearRect() {},
    drawImage() {},
    putImageData() {},
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
  };
}

function fakeOutput(): SegmentedSourceOutput {
  return {
    canvas: { width: 0, height: 0 } as HTMLCanvasElement,
    context: fakeContext() as unknown as CanvasRenderingContext2D,
    rgbCanvas: { width: 0, height: 0 } as HTMLCanvasElement,
    rgbContext: fakeContext() as unknown as CanvasRenderingContext2D,
    alphaCanvas: { width: 0, height: 0 } as HTMLCanvasElement,
    alphaContext: fakeContext() as unknown as CanvasRenderingContext2D,
    generation: 1,
    revision: 0,
    contentRevision: 0,
    contentChecksum: 0,
    lastPixelWriteAtMs: 0,
    lastValidAtMs: 0,
  };
}

function segmentResult(marker: number): LiveSegmentResult {
  const rgb = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([marker, 10, 20, 255, marker, 10, 20, 255, marker, 10, 20, 255, marker, 10, 20, 255]),
  } as ImageData;
  return {
    rgb,
    mask: {
      width: 2,
      height: 2,
      alpha: new Uint8ClampedArray([255, 200, 180, 160]),
      bounds: { minX: 0.1, minY: 0.1, maxX: 0.8, maxY: 0.9 },
      valid: true,
    },
    sourceWidth: 20,
    sourceHeight: 20,
    inferWidth: 2,
    inferHeight: 2,
    sourceKey: 'remote',
  };
}

describe('remote foreground progress and pixel commit', () => {
  it('rejects remote rVFC duplicates when mediaTime and currentTime are frozen', () => {
    const decision = decideVideoFrameAccept({
      usable: true,
      lastMediaTime: 1.2,
      lastPresentedFrames: 4,
      mediaTime: 1.2,
      presentedFrames: 4,
      rvfcDelivery: true,
      rafTick: false,
      requireProgress: true,
      videoCurrentTime: 3.5,
      lastVideoCurrentTime: 3.5,
    });
    assert.equal(decision.accept, false);
    assert.equal(decision.reason, 'duplicate');
  });

  it('recovers when currentTime advances without enqueue', () => {
    const action = decideSourceRecovery({
      sourceId: 'remote',
      videoCurrentTime: 2.1,
      previousCurrentTime: 1.8,
      lastEnqueueAtMs: 0,
      lastSegmentSuccessAtMs: 100,
      lastCommitAtMs: 100,
      lastDrawnAtMs: 100,
      commitVersion: 3,
      drawnVersion: 3,
      contentRevision: 3,
      trackReadyState: 'live',
      attached: true,
      nowMs: ENQUEUE_STALE_MS + 50,
    });
    assert.equal(action.type, 'rearm-and-enqueue');
  });

  it('changes contentRevision and checksum when remote pixels change', () => {
    const output = fakeOutput();
    assert.equal(commitSegmentedSourceOutput(output, segmentResult(40)), true);
    assert.equal(output.revision, 1);
    assert.equal(output.contentRevision, 1);
    const firstChecksum = output.contentChecksum;
    assert.equal(commitSegmentedSourceOutput(output, segmentResult(40)), false);
    assert.equal(output.revision, 1);
    assert.equal(output.contentRevision, 1);
    assert.equal(commitSegmentedSourceOutput(output, segmentResult(90)), true);
    assert.equal(output.revision, 2);
    assert.equal(output.contentRevision, 2);
    assert.notEqual(output.contentChecksum, firstChecksum);
    const a = segmentResult(1);
    const b = segmentResult(2);
    assert.notEqual(
      computeForegroundContentChecksum(a.rgb, a.mask.alpha),
      computeForegroundContentChecksum(b.rgb, b.mask.alpha),
    );
  });

  it('does not remount SameSpaceVideoStage on shotIndex or capture busy state', () => {
    const source = readFileSync(join(here, '../components/SameSpaceVideoStage.tsx'), 'utf8');
    assert.doesNotMatch(source, /shotIndex/);
    assert.doesNotMatch(source, /busyCaptureId/);
    assert.doesNotMatch(source, /isCapturing/);
    assert.match(source, /decideSourceRecovery/);
    assert.match(source, /SOURCE_HEARTBEAT_MS/);
  });
});

describe('shared layout anchors and envelopes', () => {
  it('defaults anchors near 0.43 / 0.57', () => {
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

  it('keeps default people close while exposing 0.40–0.60 overlap corridor', () => {
    assert.equal(SAME_SPACE_OVERLAP_CORRIDOR.minX, 0.40);
    assert.equal(SAME_SPACE_OVERLAP_CORRIDOR.maxX, 0.60);
    const leftHome = resolvePersonCenterX('left', 0);
    const rightHome = resolvePersonCenterX('right', 0);
    assert.ok(leftHome <= 0.45);
    assert.ok(rightHome >= 0.55);
    assert.equal(SAME_SPACE_MOTION_ENVELOPE.left.max, 0.68);
    assert.equal(SAME_SPACE_MOTION_ENVELOPE.right.min, 0.32);
  });

  it('keeps automatic centroid assist mild (not a full remapping)', () => {
    const leftTowardCenter = mapCentroidToStageCenterX('left', 0.85, false);
    const rightTowardCenter = mapCentroidToStageCenterX('right', 0.15, false);
    assert.ok(leftTowardCenter > SAME_SPACE_HOME_CENTER_X.left);
    assert.ok(leftTowardCenter < 0.55);
    assert.ok(rightTowardCenter < SAME_SPACE_HOME_CENTER_X.right);
    assert.ok(rightTowardCenter > 0.45);
  });

  it('allows overlapping destination rects without hard clip', () => {
    const left = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      slot: 'left',
      motionOffsetX: SAME_SPACE_MOTION_ENVELOPE.left.max - SAME_SPACE_HOME_CENTER_X.left,
    });
    const right = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      slot: 'right',
      motionOffsetX: SAME_SPACE_MOTION_ENVELOPE.right.min - SAME_SPACE_HOME_CENTER_X.right,
    });
    assert.ok(left.personDest.x + left.personDest.width > right.personDest.x);
    assert.ok(destinationCrossesMidline(left.dest, 1000) || left.anchor.x > 450);
  });
});

describe('collaborative position assignment', () => {
  it('uses session left/right ids over host/guest role', () => {
    const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const hostLeft = resolveSessionParticipantSlots({
      localUserId: a,
      hostUserId: a,
      guestUserId: b,
      leftParticipantId: b,
      rightParticipantId: a,
    });
    assert.equal(hostLeft.leftUserId, b);
    assert.equal(hostLeft.localSlot, 'right');
    const guestView = resolveSessionParticipantSlots({
      localUserId: b,
      hostUserId: a,
      guestUserId: b,
      leftParticipantId: b,
      rightParticipantId: a,
    });
    assert.equal(guestView.localSlot, 'left');
    assert.equal(guestView.leftUserId, hostLeft.leftUserId);
  });

  it('migration and selection RPCs allow participants', () => {
    const sql = readFileSync(
      join(here, '../../../../../supabase/migrations/202608050003_couple_booth_positions_and_collaborative_selection.sql'),
      'utf8',
    );
    assert.match(sql, /set_couple_booth_positions/);
    assert.match(sql, /NOT_PARTICIPANT/);
    assert.doesNotMatch(sql, /HOST_ONLY/);
    assert.match(sql, /selection_revision/);
    assert.match(sql, /POSITION_REVISION_CONFLICT/);
    const transformSql = readFileSync(
      join(here, '../../../../../supabase/migrations/202608050004_couple_booth_participant_transforms.sql'),
      'utf8',
    );
    assert.match(transformSql, /set_couple_booth_participant_transform/);
    assert.match(transformSql, /couple_booth_position_capabilities/);
    assert.match(transformSql, /participant_transforms/);
    assert.match(transformSql, /notify pgrst/i);
    const styleSql = readFileSync(
      join(here, '../../../../../supabase/migrations/202608050005_couple_booth_background_presets_and_color_mode.sql'),
      'utf8',
    );
    assert.match(styleSql, /set_couple_booth_style/);
    assert.match(styleSql, /studio_cream/);
    assert.match(styleSql, /monochrome/);
    assert.match(styleSql, /NOT_PARTICIPANT/);
  });
});
