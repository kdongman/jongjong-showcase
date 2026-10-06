import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BOOTH_SCENE_SPAN_MODE,
  LIVE_CAPTURE_SCENE_SPAN_MODE,
  SHOT_FRAME_LOGICAL_HEIGHT,
  SHOT_FRAME_LOGICAL_WIDTH,
  fitBoothSceneCssSize,
  getSceneFrameSpec,
} from './boothSceneSpec';
import { computeSameSpaceStripLayout } from './layout';
import { computeSameSpacePersonPlacement, defaultPersonBounds } from './sameSpaceComposition';
import { DEFAULT_SAME_SPACE_COMPOSITION_META } from './sameSpaceCompositionMeta';

describe('live/capture two_cell policy', () => {
  it('defaults live, capture, and missing meta to two_cell 4:3', () => {
    assert.equal(DEFAULT_BOOTH_SCENE_SPAN_MODE, 'two_cell');
    assert.equal(LIVE_CAPTURE_SCENE_SPAN_MODE, 'two_cell');
    assert.equal(DEFAULT_SAME_SPACE_COMPOSITION_META.sceneSpanMode, 'two_cell');
    const live = getSceneFrameSpec(LIVE_CAPTURE_SCENE_SPAN_MODE);
    assert.equal(live.frameWidth, SHOT_FRAME_LOGICAL_WIDTH);
    assert.equal(live.frameHeight, SHOT_FRAME_LOGICAL_HEIGHT);
    assert.equal(live.spanRect.width, 1);
    const css = fitBoothSceneCssSize(800, 800, 'one_cell');
    assert.ok(Math.abs(css.cssWidth / css.cssHeight - 4 / 3) < 0.02);
  });

  it('keeps one_cell and two_cell strip outer dimensions identical', () => {
    const one = computeSameSpaceStripLayout('one_cell', { exportScale: 2, useLogicalScene: true });
    const two = computeSameSpaceStripLayout('two_cell', { exportScale: 2, useLogicalScene: true });
    assert.equal(one.cellWidth, two.cellWidth);
    assert.equal(one.cellHeight, two.cellHeight);
    assert.equal(one.width, two.width);
    assert.equal(one.height, two.height);
  });

  it('shares draw rect math between preview and export scales', () => {
    const manual = { offsetX: 0.05, offsetY: -0.02, scale: 1.15, mode: 'manual' as const };
    const preview = computeSameSpacePersonPlacement({
      canvasWidth: 1200,
      canvasHeight: 900,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      manualOffset: manual,
      slot: 'left',
      spanMode: 'one_cell',
      participantCount: 2,
    });
    const exportPlacement = computeSameSpacePersonPlacement({
      canvasWidth: 2400,
      canvasHeight: 1800,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      manualOffset: manual,
      slot: 'left',
      spanMode: 'one_cell',
      participantCount: 2,
    });
    const pCx = (preview.personDest.x + preview.personDest.width / 2) / 1200;
    const eCx = (exportPlacement.personDest.x + exportPlacement.personDest.width / 2) / 2400;
    const pCy = (preview.personDest.y + preview.personDest.height / 2) / 900;
    const eCy = (exportPlacement.personDest.y + exportPlacement.personDest.height / 2) / 1800;
    assert.ok(Math.abs(pCx - eCx) < 0.002);
    assert.ok(Math.abs(pCy - eCy) < 0.002);
  });
});
