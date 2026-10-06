import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bakeVisibleRectToManualPlacement,
  bitmapDrawRectFromVisibleRect,
  denormalizeRect,
  migrateLegacyOffsetsToAbsolute,
  normalizeLogicalRect,
  resolveSubjectDrawRect,
  rectsNearlyEqual,
  setPlacementForSubject,
  visibleSubjectDrawRectFromBitmap,
  emptyShotCompositionPlacements,
} from './subjectPlacement';
import { defaultPersonBounds } from './sameSpaceComposition';
import {
  packSlotCropsWithMeta,
  parseSameSpaceCompositionMeta,
  splitSlotCropsAndMeta,
} from './sameSpaceCompositionMeta';
import { DEFAULT_SAME_SPACE_BACKGROUND } from './sameSpaceBackground';

describe('subjectPlacement absolute rect SSOT', () => {
  it('round-trips visible ↔ bitmap using alpha bounds', () => {
    const bounds = { minX: 0.2, minY: 0.1, maxX: 0.8, maxY: 0.9 };
    const visible = { x: 100, y: 50, width: 200, height: 400 };
    const dest = bitmapDrawRectFromVisibleRect(visible, bounds);
    const back = visibleSubjectDrawRectFromBitmap(dest, bounds);
    assert.ok(rectsNearlyEqual(visible, back, 0.01));
  });

  it('manual resolveSubjectDrawRect restores exact normalized rect', () => {
    const placement = bakeVisibleRectToManualPlacement(
      { x: 240, y: 90, width: 300, height: 600 },
      1200,
      900,
    );
    const resolved = resolveSubjectDrawRect({
      frameWidth: 1200,
      frameHeight: 900,
      placement,
      alphaBounds: defaultPersonBounds(),
      sourceWidth: 640,
      sourceHeight: 480,
      homeSlot: 'left',
      spanMode: 'two_cell',
    });
    assert.ok(rectsNearlyEqual(resolved.personDest, { x: 240, y: 90, width: 300, height: 600 }, 1));
  });

  it('manual rect is stable across frame scale (normalized)', () => {
    const placement = bakeVisibleRectToManualPlacement(
      { x: 120, y: 90, width: 240, height: 480 },
      1200,
      900,
    );
    const large = resolveSubjectDrawRect({
      frameWidth: 1200,
      frameHeight: 900,
      placement,
      alphaBounds: defaultPersonBounds(),
      sourceWidth: 640,
      sourceHeight: 480,
      homeSlot: 'left',
      spanMode: 'two_cell',
    });
    const small = resolveSubjectDrawRect({
      frameWidth: 300,
      frameHeight: 225,
      placement,
      alphaBounds: defaultPersonBounds(),
      sourceWidth: 640,
      sourceHeight: 480,
      homeSlot: 'left',
      spanMode: 'two_cell',
    });
    const nLarge = normalizeLogicalRect(large.personDest, 1200, 900);
    const nSmall = normalizeLogicalRect(small.personDest, 300, 225);
    assert.ok(Math.abs(nLarge.x - nSmall.x) < 1 / 1200);
    assert.ok(Math.abs(nLarge.width - nSmall.width) < 1 / 1200);
  });

  it('crossing keeps subject identity (not visual left/right)', () => {
    let shot = emptyShotCompositionPlacements();
    shot = setPlacementForSubject(
      shot,
      'two_cell',
      'user-a',
      bakeVisibleRectToManualPlacement({ x: 700, y: 100, width: 250, height: 500 }, 1200, 900),
    );
    shot = setPlacementForSubject(
      shot,
      'two_cell',
      'user-b',
      bakeVisibleRectToManualPlacement({ x: 200, y: 100, width: 250, height: 500 }, 1200, 900),
    );
    // user-a is visually on the right (x=700) but identity stays user-a
    assert.equal(shot.two_cell['user-a']!.rect!.x > 0.5, true);
    assert.equal(shot.two_cell['user-b']!.rect!.x < 0.5, true);
  });

  it('mode placements are independent', () => {
    let shot = emptyShotCompositionPlacements();
    shot = setPlacementForSubject(
      shot,
      'one_cell',
      'user-a',
      bakeVisibleRectToManualPlacement({ x: 400, y: 100, width: 200, height: 400 }, 1200, 900),
    );
    shot = setPlacementForSubject(
      shot,
      'two_cell',
      'user-a',
      bakeVisibleRectToManualPlacement({ x: 100, y: 100, width: 200, height: 400 }, 1200, 900),
    );
    assert.notEqual(shot.one_cell['user-a']!.rect!.x, shot.two_cell['user-a']!.rect!.x);
  });

  it('legacy migration maps left/right onto subject ids once', () => {
    const migrated = migrateLegacyOffsetsToAbsolute({
      leftSubjectId: 'host-1',
      rightSubjectId: 'guest-2',
      leftPersonDest: { x: 100, y: 50, width: 200, height: 400 },
      rightPersonDest: { x: 500, y: 50, width: 200, height: 400 },
      frameWidth: 1200,
      frameHeight: 900,
      leftWasEdited: true,
      rightWasEdited: false,
    });
    assert.equal(migrated['host-1']!.mode, 'manual');
    assert.equal(migrated['guest-2']!.mode, 'auto');
    assert.ok(migrated['host-1']!.rect);
  });

  it('meta pack/parse preserves manual absolute rects and mode', () => {
    const rect = normalizeLogicalRect({ x: 240, y: 90, width: 300, height: 600 }, 1200, 900);
    const packed = packSlotCropsWithMeta({}, {
      background: DEFAULT_SAME_SPACE_BACKGROUND,
      frontSlot: 'left',
      soloLayout: 'half',
      revision: 1,
      sceneSpanMode: 'two_cell',
      slotSubjectPlacements: {
        '4': {
          one_cell: {},
          two_cell: {
            'user-a': { mode: 'manual', rect },
            'user-b': { mode: 'auto', rect: null },
          },
          frontSubjectId: 'user-a',
        },
      },
    });
    const { meta } = splitSlotCropsAndMeta(packed);
    const row = meta.slotSubjectPlacements?.['4'];
    assert.ok(row);
    assert.equal(row!.two_cell['user-a']!.mode, 'manual');
    assert.deepEqual(row!.two_cell['user-a']!.rect, rect);
    assert.equal(row!.frontSubjectId, 'user-a');

    // Round-trip again
    const again = parseSameSpaceCompositionMeta(
      (packed as Record<string, unknown>).__sameSpace,
    );
    assert.deepEqual(
      again.slotSubjectPlacements?.['4']?.two_cell['user-a']?.rect,
      rect,
    );
  });

  it('denormalize then normalize is stable within 1px', () => {
    const n = { x: 0.2, y: 0.1, width: 0.25, height: 0.55 };
    const logical = denormalizeRect(n, 1200, 900);
    const back = normalizeLogicalRect(logical, 1200, 900);
    const a = denormalizeRect(n, 1200, 900);
    const b = denormalizeRect(back, 1200, 900);
    assert.ok(rectsNearlyEqual(a, b, 1));
  });
});
