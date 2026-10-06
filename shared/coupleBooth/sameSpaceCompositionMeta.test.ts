import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SAME_SPACE_COMPOSITION_META,
  packSlotCropsWithMeta,
  parseSameSpaceCompositionMeta,
  splitSlotCropsAndMeta,
} from './sameSpaceCompositionMeta';
import { normalizeHexColor } from './sameSpaceBackground';

describe('sameSpaceCompositionMeta', () => {
  it('packs and splits reserved meta without losing numeric crops', () => {
    const packed = packSlotCropsWithMeta(
      { 0: { scale: 1.2, x: 0.1, y: -0.2 }, 1: { scale: 1, x: 0, y: 0 } },
      {
        ...DEFAULT_SAME_SPACE_COMPOSITION_META,
        background: { type: 'solid', color: '#FFFFFF' },
        frontSlot: 'right',
        revision: 3,
        sceneSpanMode: 'one_cell',
        slotManualOffsets: {
          '0': {
            left: { offsetX: 0.05, offsetY: -0.02, scale: 1.1 },
            right: { offsetX: -0.04, offsetY: 0.01, scale: 0.95 },
            frontSlot: 'right',
          },
        },
      },
    );
    const { slotCrops, meta } = splitSlotCropsAndMeta(packed as Record<string, unknown>);
    assert.deepEqual(slotCrops['0'], { scale: 1.2, x: 0.1, y: -0.2 });
    assert.equal(meta.frontSlot, 'right');
    assert.equal(meta.revision, 3);
    assert.equal(meta.sceneSpanMode, 'one_cell');
    assert.equal(meta.background.type, 'solid');
    assert.equal(meta.slotManualOffsets?.['0']?.left.offsetX, 0.05);
    assert.equal(meta.slotManualOffsets?.['0']?.right.scale, 0.95);
    assert.equal(meta.slotManualOffsets?.['0']?.frontSlot, 'right');
  });

  it('defaults missing sceneSpanMode to legacy two_cell', () => {
    const meta = parseSameSpaceCompositionMeta({
      background: { type: 'preset', presetId: 'studio' },
      frontSlot: 'left',
      revision: 1,
    });
    assert.equal(meta.sceneSpanMode, 'two_cell');
  });

  it('uses DEFAULT two_cell when crops have never stored Same Space meta', () => {
    const { meta } = splitSlotCropsAndMeta({});
    assert.equal(meta.sceneSpanMode, 'two_cell');
    assert.equal(meta.sceneSpanMode, DEFAULT_SAME_SPACE_COMPOSITION_META.sceneSpanMode);
  });

  it('rejects unsafe color strings', () => {
    assert.equal(normalizeHexColor('red'), '#F7F2FA');
    assert.equal(normalizeHexColor('#abc'), '#AABBCC');
    assert.equal(normalizeHexColor('#112233'), '#112233');
    assert.equal(
      parseSameSpaceCompositionMeta({ background: { type: 'solid', color: 'url(x)' } }).background.type,
      'preset',
    );
  });
});
