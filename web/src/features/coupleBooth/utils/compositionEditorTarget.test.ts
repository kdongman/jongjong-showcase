import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCompositionEditorTarget,
  compositionEditorTitle,
  resolveStripShotIndex,
} from './compositionEditorTarget';

describe('compositionEditorTarget', () => {
  it('maps strip slot to selected shot index (not slot===shot)', () => {
    const selected = [2, 4, 5, 7];
    assert.equal(resolveStripShotIndex(selected, 0), 2);
    assert.equal(resolveStripShotIndex(selected, 2), 5);
    assert.equal(resolveStripShotIndex(selected, 3), 7);
    assert.equal(resolveStripShotIndex(selected, 9), undefined);
  });

  it('builds target with strip metadata only for final-strip', () => {
    assert.deepEqual(
      buildCompositionEditorTarget({ source: 'shot-card', shotIndex: 5, stripSlotIndex: 2 }),
      { shotIndex: 5, stripSlotIndex: undefined, source: 'shot-card' },
    );
    assert.deepEqual(
      buildCompositionEditorTarget({ source: 'final-strip', shotIndex: 5, stripSlotIndex: 2 }),
      { shotIndex: 5, stripSlotIndex: 2, source: 'final-strip' },
    );
  });

  it('titles strip edits with slot and shot', () => {
    assert.equal(
      compositionEditorTitle({ shotIndex: 5, stripSlotIndex: 2, source: 'final-strip' }),
      '최종 사진 3 · 촬영 #5',
    );
    assert.equal(
      compositionEditorTitle({ shotIndex: 5, source: 'shot-card' }),
      '촬영 #5',
    );
  });
});
