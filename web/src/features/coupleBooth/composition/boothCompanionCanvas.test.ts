import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDrawableBoothCompanion } from './boothCompanionCanvas';

describe('Booth companion canvas failure safety', () => {
  it('skips missing and stale assets without blocking human capture', () => {
    assert.equal(isDrawableBoothCompanion(undefined), false);
    assert.equal(isDrawableBoothCompanion({
      id: 'stale',
      renderAsset: { id: 'missing', uri: '' },
      transform: { x: 0.2, y: 0.9, scale: 0.17, rotation: 0, flipX: false },
      zIndex: 0,
    }), false);
  });

  it('accepts finite presentation snapshots for both preview and capture canvas', () => {
    assert.equal(isDrawableBoothCompanion({
      id: 'pet-1',
      renderAsset: { id: 'idle', uri: '/pets/idle.svg' },
      transform: { x: 0.2, y: 0.9, scale: 0.17, rotation: 1, flipX: false },
      zIndex: 0,
    }), true);
  });
});
