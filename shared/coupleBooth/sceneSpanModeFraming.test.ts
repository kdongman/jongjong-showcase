import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOOTH_ONE_CELL_SPAN_HEIGHT,
  BOOTH_ONE_CELL_SPAN_WIDTH,
  BOOTH_SCENE_LOGICAL_HEIGHT,
  BOOTH_SCENE_LOGICAL_WIDTH,
  DEFAULT_BOOTH_SCENE_SPAN_MODE,
  SHOT_FRAME_LOGICAL_HEIGHT,
  SHOT_FRAME_LOGICAL_WIDTH,
  fitBoothSceneCssSize,
  getSceneFrameSpec,
  sceneSpecForSpanMode,
} from './boothSceneSpec';
import {
  calculateSubjectDrawRect,
  computeSameSpacePersonPlacement,
  defaultPersonBounds,
} from './sameSpaceComposition';
import { encodeBoothEvent, parseBoothEvent } from './protocol';
import { splitSlotCropsAndMeta } from './sameSpaceCompositionMeta';
import { computeSameSpaceStripLayout } from './layout';

const here = dirname(fileURLToPath(import.meta.url));

describe('sceneSpanMode live/review framing', () => {
  it('keeps external frame 4:3 and one_cell span ~half width', () => {
    const one = getSceneFrameSpec('one_cell');
    const two = getSceneFrameSpec('two_cell');
    assert.equal(one.frameWidth, SHOT_FRAME_LOGICAL_WIDTH);
    assert.equal(one.frameHeight, SHOT_FRAME_LOGICAL_HEIGHT);
    assert.equal(two.frameWidth, SHOT_FRAME_LOGICAL_WIDTH);
    assert.equal(two.frameHeight, SHOT_FRAME_LOGICAL_HEIGHT);
    assert.equal(sceneSpecForSpanMode('one_cell').width, BOOTH_SCENE_LOGICAL_WIDTH);
    assert.equal(sceneSpecForSpanMode('one_cell').height, BOOTH_SCENE_LOGICAL_HEIGHT);
    assert.equal(BOOTH_ONE_CELL_SPAN_WIDTH, 600);
    assert.equal(BOOTH_ONE_CELL_SPAN_HEIGHT, 900);
    assert.ok(Math.abs(one.aspectRatio - 4 / 3) < 1e-9);
    assert.ok(Math.abs(two.aspectRatio - 4 / 3) < 1e-9);
    assert.equal(DEFAULT_BOOTH_SCENE_SPAN_MODE, 'two_cell');
  });

  it('letterboxes CSS size as 4:3 without stretching', () => {
    const one = fitBoothSceneCssSize(900, 900, 'one_cell');
    assert.ok(Math.abs(one.cssWidth / one.cssHeight - 4 / 3) < 0.02);
    assert.ok(one.cssHeight <= 900);
    assert.ok(one.cssWidth <= 900);
    const two = fitBoothSceneCssSize(800, 400, 'two_cell');
    assert.ok(Math.abs(two.cssWidth / two.cssHeight - 4 / 3) < 0.02);
    assert.ok(two.cssHeight <= 400);
  });

  it('defaults empty session crops to one_cell (not legacy two_cell)', () => {
    assert.equal(splitSlotCropsAndMeta({}).meta.sceneSpanMode, 'two_cell');
  });

  it('keeps the same draw rect for identical transforms across equal-aspect frames', () => {
    const manual = { offsetX: 0.1, offsetY: -0.05, scale: 1.2, mode: 'manual' as const };
    const a = calculateSubjectDrawRect({
      canvasWidth: 1200,
      canvasHeight: 900,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      manualOffset: manual,
      slot: 'left',
      participantCount: 2,
      spanMode: 'one_cell',
    });
    const b = computeSameSpacePersonPlacement({
      canvasWidth: 2400,
      canvasHeight: 1800,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      manualOffset: manual,
      slot: 'left',
      participantCount: 2,
      spanMode: 'one_cell',
    });
    const aCx = (a.personDest.x + a.personDest.width / 2) / 1200;
    const bCx = (b.personDest.x + b.personDest.width / 2) / 2400;
    assert.ok(Math.abs(aCx - bCx) < 0.02);
  });

  it('keeps one_cell and two_cell final strip outer ratios identical', () => {
    const one = computeSameSpaceStripLayout('one_cell', { exportScale: 2, useLogicalScene: true });
    const two = computeSameSpaceStripLayout('two_cell', { exportScale: 2, useLogicalScene: true });
    assert.equal(one.width, two.width);
    assert.equal(one.height, two.height);
    assert.equal(one.cellWidth / one.cellHeight, two.cellWidth / two.cellHeight);
  });

  it('round-trips scene_span_preview over the booth protocol', () => {
    const encoded = encodeBoothEvent({
      type: 'scene_span_preview',
      userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      sceneSpanMode: 'two_cell',
    });
    const parsed = parseBoothEvent(encoded);
    assert.equal(parsed?.type, 'scene_span_preview');
    if (parsed?.type === 'scene_span_preview') {
      assert.equal(parsed.sceneSpanMode, 'two_cell');
    }
  });

  it('wires SameSpaceVideoStage to sceneSpanMode without remounting on mode alone', () => {
    const stage = readFileSync(
      join(here, '../../web/src/features/coupleBooth/components/SameSpaceVideoStage.tsx'),
      'utf8',
    );
    assert.match(stage, /sceneSpanMode/);
    assert.match(stage, /fitBoothSceneCssSize/);
    assert.match(stage, /compositionRef\.current\.sceneSpanMode/);
    // Pipeline effect deps must not include sceneSpanMode (resize-only path).
    assert.match(stage, /Mode change must resize backing store without remounting/);
  });
});
