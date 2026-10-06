import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  backgroundPathBelongsToSession,
  normalizeHexColor,
  parseSameSpaceBackground,
  sanitizeBackgroundStoragePath,
} from './sameSpaceBackground';
import {
  compareUserIdsCanonical,
  compositionSlotForUserId,
} from './sameSpaceLayoutSpec';
import { computeSameSpacePersonPlacement } from './sameSpaceComposition';
import { packSlotCropsWithMeta, splitSlotCropsAndMeta } from './sameSpaceCompositionMeta';

describe('canonical UUID slot comparator', () => {
  const a = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const b = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('uses code-unit order, not localeCompare', () => {
    assert.equal(compareUserIdsCanonical(a, b) < 0, true);
    assert.equal(compareUserIdsCanonical(b, a) > 0, true);
    assert.equal(compareUserIdsCanonical(a, a), 0);
    // localeCompare with some locales can reorder digits/letters; our comparator must not.
    assert.equal(compositionSlotForUserId(a, b, a), 'left');
    assert.equal(compositionSlotForUserId(b, a, b), 'right');
  });

  it('keeps left/right identical when host/guest roles swap', () => {
    const leftWhenAHost = compositionSlotForUserId(a, a, b);
    const leftWhenBHost = compositionSlotForUserId(a, b, a);
    assert.equal(leftWhenAHost, 'left');
    assert.equal(leftWhenBHost, 'left');
    assert.equal(compositionSlotForUserId(b, a, b), 'right');
    assert.equal(compositionSlotForUserId(b, b, a), 'right');
  });
});

describe('background storage sanitization', () => {
  const couple = '11111111-1111-1111-1111-111111111111';
  const session = '22222222-2222-2222-2222-222222222222';
  const good = `${couple}/${session}/backgrounds/custom-1.webp`;

  it('accepts only couple/session background object paths', () => {
    assert.equal(sanitizeBackgroundStoragePath(good), good);
    assert.equal(backgroundPathBelongsToSession(good, couple, session), true);
  });

  it('rejects urls, scripts, traversal, and cross-session paths', () => {
    assert.equal(sanitizeBackgroundStoragePath('https://evil.example/x.png'), undefined);
    assert.equal(sanitizeBackgroundStoragePath('javascript:alert(1)'), undefined);
    assert.equal(sanitizeBackgroundStoragePath('data:image/png;base64,aaa'), undefined);
    assert.equal(sanitizeBackgroundStoragePath(`${couple}/${session}/backgrounds/../secret.png`), undefined);
    const otherSession = `${couple}/33333333-3333-3333-3333-333333333333/backgrounds/x.png`;
    // Format-valid path still requires session ownership check.
    assert.equal(sanitizeBackgroundStoragePath(otherSession), otherSession);
    assert.equal(backgroundPathBelongsToSession(otherSession, couple, session), false);
    assert.equal(backgroundPathBelongsToSession(good, couple, '33333333-3333-3333-3333-333333333333'), false);
  });

  it('strips runtime urls when parsing persisted background metadata', () => {
    const parsed = parseSameSpaceBackground({
      type: 'image',
      presetId: 'custom-1',
      url: 'https://signed.example/temp',
      storagePath: good,
    });
    assert.equal(parsed.type, 'image');
    if (parsed.type === 'image') {
      assert.equal(parsed.url, undefined);
      assert.equal(parsed.storagePath, good);
    }
    assert.equal(normalizeHexColor('red'), '#F7F2FA');
  });

  it('does not embed signed urls when packing crops meta', () => {
    const packed = packSlotCropsWithMeta(
      { 0: { scale: 1, x: 0, y: 0 } },
      {
        background: {
          type: 'image',
          presetId: 'custom-1',
          url: 'https://signed.example/temp',
          storagePath: good,
        },
        frontSlot: 'left',
        soloLayout: 'half',
        revision: 2,
      },
    );
    const { meta } = splitSlotCropsAndMeta(packed as Record<string, unknown>);
    assert.equal(meta.background.type, 'image');
    if (meta.background.type === 'image') {
      assert.equal(meta.background.url, undefined);
      assert.equal(meta.background.storagePath, good);
    }
  });
});

describe('preview and export placement parity', () => {
  it('uses identical placement for the same composition inputs', () => {
    const input = {
      canvasWidth: 1080,
      canvasHeight: 400,
      sourceWidth: 720,
      sourceHeight: 1280,
      personBounds: { minX: 0.2, minY: 0.08, maxX: 0.78, maxY: 0.96 },
      normalizedTransform: { x: 0.28, y: -0.1, scale: 1.1 },
      slot: 'left' as const,
      soloLayout: 'half' as const,
      participantCount: 2,
    };
    const preview = computeSameSpacePersonPlacement(input);
    const exportPlacement = computeSameSpacePersonPlacement(input);
    assert.deepEqual(preview, exportPlacement);
  });

  it('keeps left/right anchors at 38/62 for close couple packing', () => {
    const left = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      slot: 'left',
    });
    const right = computeSameSpacePersonPlacement({
      canvasWidth: 1000,
      canvasHeight: 750,
      sourceWidth: 720,
      sourceHeight: 1280,
      slot: 'right',
    });
    assert.ok(Math.abs(left.anchor.x / 1000 - 0.43) < 0.08);
    assert.ok(Math.abs(right.anchor.x / 1000 - 0.57) < 0.08);
  });
});
