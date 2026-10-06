import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOTH_ONE_CELL_ASPECT_RATIO,
  BOOTH_ONE_CELL_SPAN_HEIGHT,
  BOOTH_ONE_CELL_SPAN_WIDTH,
  BOOTH_SCENE_ASPECT_RATIO,
  BOOTH_SCENE_LOGICAL_HEIGHT,
  BOOTH_SCENE_LOGICAL_WIDTH,
  DEFAULT_BOOTH_SCENE_SPAN_MODE,
  DEFAULT_CAPTURE_VIEWPORT_MODE,
  getCaptureFrameDimensions,
  LEGACY_BOOTH_SCENE_SPAN_MODE,
  SHOT_FRAME_LOGICAL_HEIGHT,
  SHOT_FRAME_LOGICAL_WIDTH,
  fitBoothSceneCssSize,
  getSceneFrameSpec,
  isUniformScale,
  parseBoothSceneSpanMode,
  sceneSizeForWidth,
  sceneSpecForSpanMode,
  uniformFitScale,
} from './boothSceneSpec';
import { computeSameSpacePersonPlacement, defaultPersonBounds } from './sameSpaceComposition';
import { computeSameSpaceStripLayout } from './layout';

describe('boothSceneSpec', () => {
  it('keeps external shot frame 4:3 for both span modes', () => {
    assert.equal(BOOTH_SCENE_ASPECT_RATIO, 4 / 3);
    assert.equal(SHOT_FRAME_LOGICAL_WIDTH, 1200);
    assert.equal(SHOT_FRAME_LOGICAL_HEIGHT, 900);
    assert.equal(BOOTH_SCENE_LOGICAL_WIDTH / BOOTH_SCENE_LOGICAL_HEIGHT, 4 / 3);
    assert.equal(BOOTH_ONE_CELL_SPAN_WIDTH, 600);
    assert.equal(BOOTH_ONE_CELL_SPAN_HEIGHT, 900);
    assert.equal(BOOTH_ONE_CELL_ASPECT_RATIO, 2 / 3);
    assert.equal(DEFAULT_BOOTH_SCENE_SPAN_MODE, 'two_cell');
    assert.equal(LEGACY_BOOTH_SCENE_SPAN_MODE, 'two_cell');

    const one = getSceneFrameSpec('one_cell');
    const two = getSceneFrameSpec('two_cell');
    assert.equal(one.frameWidth, 1200);
    assert.equal(one.frameHeight, 900);
    assert.equal(two.frameWidth, 1200);
    assert.equal(two.frameHeight, 900);
    assert.ok(Math.abs(one.spanRect.width - 0.5) < 1e-9);
    assert.equal(two.spanRect.width, 1);
    assert.equal(sceneSpecForSpanMode('one_cell').aspectRatio, 4 / 3);
    assert.equal(sceneSpecForSpanMode('two_cell').aspectRatio, 4 / 3);
  });

  it('parses missing span mode as legacy two_cell', () => {
    assert.equal(parseBoothSceneSpanMode(undefined), 'two_cell');
    assert.equal(parseBoothSceneSpanMode('one_cell'), 'one_cell');
  });

  it('uses one independent canonical frame mode for every composition span', () => {
    assert.equal(DEFAULT_CAPTURE_VIEWPORT_MODE, 'desktop');
    assert.deepEqual(getCaptureFrameDimensions('desktop'), { width: 1200, height: 900 });
    assert.deepEqual(getCaptureFrameDimensions('mobile'), { width: 900, height: 1200 });
    assert.equal(sceneSpecForSpanMode('one_cell', 'mobile').width, 900);
    assert.equal(sceneSpecForSpanMode('one_cell', 'mobile').height, 1200);
    assert.equal(sceneSpecForSpanMode('two_cell', 'mobile').aspectRatio, 3 / 4);
    assert.equal(fitBoothSceneCssSize(900, 1200, 'two_cell', 'mobile').aspectRatio, 3 / 4);
  });

  it('builds strip layouts with identical outer cell aspects', () => {
    const one = computeSameSpaceStripLayout(1080, 'one_cell');
    const two = computeSameSpaceStripLayout(1080, 'two_cell');
    assert.equal(one.cellWidth, two.cellWidth);
    assert.equal(one.cellHeight, two.cellHeight);
    assert.ok(Math.abs(one.cellWidth / one.cellHeight - 4 / 3) < 0.02);
    assert.ok(Math.abs(two.cellWidth / two.cellHeight - 4 / 3) < 0.02);
    assert.equal(one.width, two.width);
  });

  it('preserves canonical cell aspect inside the fixed 1200x3600 final strip', () => {
    const desktop = computeSameSpaceStripLayout('two_cell', {
      outputHeight: 3600,
      captureViewportMode: 'desktop',
    });
    const mobile = computeSameSpaceStripLayout('two_cell', {
      outputHeight: 3600,
      captureViewportMode: 'mobile',
    });
    assert.equal(desktop.width, 1200);
    assert.equal(desktop.height, 3600);
    assert.equal(desktop.cellWidth / desktop.cellHeight, 4 / 3);
    assert.equal(mobile.cellWidth / mobile.cellHeight, 3 / 4);
    assert.ok(mobile.cellWidth < desktop.cellWidth);
  });

  it('exportScale 2 doubles the shared 1200×900 logical scene', () => {
    const one = computeSameSpaceStripLayout('one_cell', { exportScale: 2, useLogicalScene: true });
    const two = computeSameSpaceStripLayout('two_cell', { exportScale: 2, useLogicalScene: true });
    assert.equal(one.cellWidth, SHOT_FRAME_LOGICAL_WIDTH * 2);
    assert.equal(one.cellHeight, SHOT_FRAME_LOGICAL_HEIGHT * 2);
    assert.equal(two.cellWidth, SHOT_FRAME_LOGICAL_WIDTH * 2);
    assert.equal(two.cellHeight, SHOT_FRAME_LOGICAL_HEIGHT * 2);
    assert.equal(one.width, two.width);
    assert.equal(one.height, two.height);
  });

  it('letterboxes CSS size as 4:3 for both modes', () => {
    const one = fitBoothSceneCssSize(900, 900, 'one_cell');
    const two = fitBoothSceneCssSize(900, 900, 'two_cell');
    assert.ok(Math.abs(one.cssWidth / one.cssHeight - 4 / 3) < 0.02);
    assert.ok(Math.abs(two.cssWidth / two.cssHeight - 4 / 3) < 0.02);
  });

  it('does not let portrait source change output scene aspect', () => {
    const scene = sceneSizeForWidth(1200, 'two_cell');
    const placement = computeSameSpacePersonPlacement({
      canvasWidth: scene.width,
      canvasHeight: scene.height,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      slot: 'left',
      participantCount: 2,
      spanMode: 'two_cell',
    });
    assert.equal(scene.width / scene.height, 4 / 3);
    assert.ok(isUniformScale(
      placement.dest.width / 720,
      placement.dest.height / 1280,
    ));
  });

  it('keeps uniform scale inside one_cell composition span', () => {
    const spec = sceneSpecForSpanMode('one_cell');
    const scale = uniformFitScale(1280, 720, spec.width * 0.5, spec.height * 0.8);
    assert.ok(scale > 0);
    const placement = computeSameSpacePersonPlacement({
      canvasWidth: spec.width,
      canvasHeight: spec.height,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: defaultPersonBounds(),
      slot: 'right',
      participantCount: 2,
      spanMode: 'one_cell',
      manualOffset: { offsetX: 0, offsetY: 0, scale: 1.4, mode: 'manual' },
    });
    assert.ok(isUniformScale(
      placement.dest.width / 720,
      placement.dest.height / 1280,
    ));
    assert.ok(placement.personDest.height > spec.height * 0.4);
  });
});
