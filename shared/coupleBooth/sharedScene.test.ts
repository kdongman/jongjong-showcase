import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOOTH_SHARED_SCENE_DEFINITIONS,
  applyBoothSharedSceneEvent,
  boothSharedSceneDefinition,
  createBoothSharedSceneEvent,
  scenePaintBounds,
  scenePaintBoundsToPixels,
  type BoothSharedSceneEvent,
} from './sharedScene';
import { encodeBoothEvent, parseBoothEvent } from './protocol';
import { orderCoupleBoothStageLayers } from './coupleBoothStage';
import { proposeBoothAutoAlignment } from './autoAlignment';

const here = dirname(fileURLToPath(import.meta.url));

function event(overrides: Partial<BoothSharedSceneEvent> = {}): BoothSharedSceneEvent {
  return createBoothSharedSceneEvent({
    sessionId: 'session-one',
    sceneId: 'photo-studio',
    eventId: 'scene-event-1',
    selectedBy: 'user-a',
    selectedAt: 1_000,
    version: 1,
    ...overrides,
  });
}

describe('Couple Booth Shared Scene V1', () => {
  it('defines Classic plus exactly three production-safe scenes', () => {
    assert.deepEqual(
      BOOTH_SHARED_SCENE_DEFINITIONS.map((scene) => scene.id),
      ['classic', 'photo-studio', 'cozy-room', 'night-booth'],
    );
    assert.equal(BOOTH_SHARED_SCENE_DEFINITIONS.every((scene) => scene.previewEligible && scene.exportEligible), true);
  });

  it('falls back invalid or missing scene ids to unchanged Classic behavior', () => {
    assert.equal(boothSharedSceneDefinition(undefined).id, 'classic');
    assert.equal(boothSharedSceneDefinition('not-a-scene').id, 'classic');
    assert.equal(boothSharedSceneDefinition('classic').useExistingBackground, true);
    assert.deepEqual(boothSharedSceneDefinition('classic').foregroundElements, []);
  });

  it('accepts newer selection and ignores stale, duplicate, and wrong-session events', () => {
    const current = event({ eventId: 'new', version: 4, sceneId: 'cozy-room' });
    const stale = event({ eventId: 'old', version: 3, selectedAt: 9_000, sceneId: 'night-booth' });
    const newest = event({ eventId: 'newest', version: 5, sceneId: 'night-booth' });
    const wrong = event({ sessionId: 'session-two', eventId: 'wrong', version: 99 });
    assert.equal(applyBoothSharedSceneEvent(current, stale, 'session-one'), current);
    assert.equal(applyBoothSharedSceneEvent(current, { ...current }, 'session-one'), current);
    assert.equal(applyBoothSharedSceneEvent(current, wrong, 'session-one'), current);
    assert.equal(applyBoothSharedSceneEvent(current, newest, 'session-one'), newest);
  });

  it('uses Classic as a synchronized reset event', () => {
    const classic = event({ eventId: 'classic', version: 2, sceneId: 'classic' });
    assert.equal(applyBoothSharedSceneEvent(event(), classic, 'session-one')?.sceneId, 'classic');
  });

  it('round-trips a separate scene_selected reliable contract', () => {
    const parsed = parseBoothEvent(encodeBoothEvent(event()));
    assert.equal(parsed?.type, 'scene_selected');
    if (parsed?.type === 'scene_selected') assert.equal(parsed.sceneId, 'photo-studio');
  });

  it('maps the same normalized geometry proportionally in preview and 1200x900 export', () => {
    const floor = boothSharedSceneDefinition('photo-studio').backgroundDecoration[1]!;
    const preview = scenePaintBoundsToPixels(floor, 600, 450);
    const output = scenePaintBoundsToPixels(floor, 1200, 900);
    assert.deepEqual(output, {
      x: preview.x * 2,
      y: preview.y * 2,
      width: preview.width * 2,
      height: preview.height * 2,
    });
  });

  it('keeps all safe regions and scene paint inside normalized stage bounds', () => {
    for (const scene of BOOTH_SHARED_SCENE_DEFINITIONS) {
      const allRects = [scene.safeRegion, ...scene.backgroundDecoration.map(scenePaintBounds), ...scene.foregroundElements.map(scenePaintBounds)];
      for (const rect of allRects) {
        assert.ok(rect.x >= 0 && rect.y >= 0, `${scene.id} begins outside stage`);
        assert.ok(rect.x + rect.width <= 1 + 1e-9, `${scene.id} exceeds stage width`);
        assert.ok(rect.y + rect.height <= 1 + 1e-9, `${scene.id} exceeds stage height`);
      }
    }
  });

  it('provides common foreground occlusion without entering the participant safe region', () => {
    const cozy = boothSharedSceneDefinition('cozy-room');
    assert.ok(cozy.foregroundElements.length > 0);
    for (const paint of cozy.foregroundElements) {
      const bounds = scenePaintBounds(paint);
      assert.ok(bounds.y >= cozy.safeRegion.y + cozy.safeRegion.height);
    }
  });

  it('preserves canonical deterministic layer ordering', () => {
    const ordered = orderCoupleBoothStageLayers([
      { id: 'frame', kind: 'frame' },
      { id: 'foreground', kind: 'foreground' },
      { id: 'front-person', kind: 'participant', zIndex: 2 },
      { id: 'effect', kind: 'effect' },
      { id: 'background-decor', kind: 'background', zIndex: 1 },
      { id: 'companion', kind: 'companion' },
      { id: 'back-person', kind: 'participant', zIndex: 1 },
      { id: 'background', kind: 'background', zIndex: 0 },
    ]).map((layer) => layer.id);
    assert.deepEqual(ordered, [
      'background',
      'background-decor',
      'back-person',
      'front-person',
      'companion',
      'foreground',
      'effect',
      'frame',
    ]);
  });

  it('does not alter Auto Alignment transforms when scene selection changes', () => {
    const input = {
      subjects: [
        { id: 'a', sourceWidth: 600, sourceHeight: 900, bounds: { minX: 0.2, minY: 0.1, maxX: 0.8, maxY: 0.95 } },
        { id: 'b', sourceWidth: 600, sourceHeight: 900, bounds: { minX: 0.18, minY: 0.08, maxX: 0.82, maxY: 0.96 } },
      ],
      spanMode: 'two_cell' as const,
    };
    const before = proposeBoothAutoAlignment(input);
    applyBoothSharedSceneEvent(null, event({ sceneId: 'night-booth' }), 'session-one');
    const after = proposeBoothAutoAlignment(input);
    assert.deepEqual(after, before);
  });

  it('wires one shared renderer through live, review/editor, and final export while keeping Pose Guide DOM-only', () => {
    const liveRenderer = readFileSync(
      join(here, '../../web/src/features/coupleBooth/composition/sameSpaceCanvasRenderer.ts'),
      'utf8',
    );
    const liveStage = readFileSync(
      join(here, '../../web/src/features/coupleBooth/components/SameSpaceVideoStage.tsx'),
      'utf8',
    );
    const review = readFileSync(
      join(here, '../../web/src/features/coupleBooth/components/SameSpaceScenePreview.tsx'),
      'utf8',
    );
    const exporter = readFileSync(
      join(here, '../../web/src/features/coupleBooth/utils/boothComposer.ts'),
      'utf8',
    );
    assert.match(liveRenderer, /renderBoothSharedSceneBackground/);
    assert.match(liveRenderer, /renderBoothSharedSceneForeground/);
    assert.match(liveStage, /sharedSceneId: compositionRef\.current\.sharedSceneId/);
    assert.match(review, /renderBoothSharedSceneBackground/);
    assert.match(review, /renderBoothSharedSceneForeground/);
    assert.match(exporter, /renderBoothSharedSceneBackground/);
    assert.match(exporter, /renderBoothSharedSceneForeground/);
    assert.ok(
      exporter.indexOf('for (const layer of companionLayers)')
        < exporter.indexOf('for (const foreground of sharedSceneForegrounds)'),
    );
    assert.ok(
      liveRenderer.indexOf('for (const stageLayer of participantLayers)')
        < liveRenderer.indexOf('renderBoothSharedSceneForeground(ctx, width, height'),
    );
    assert.doesNotMatch(liveRenderer, /CouplePoseGuideOverlay/);
    assert.doesNotMatch(exporter, /CouplePoseGuideOverlay|poseGuide/);
  });
});
