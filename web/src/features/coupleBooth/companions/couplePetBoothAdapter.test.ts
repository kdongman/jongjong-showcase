import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CouplePet } from './couplePetBoothAdapter';
import { couplePetsToBoothCompanionSnapshots, defaultBoothCompanionPlacement } from './couplePetBoothAdapter';

const pet = (id: string, species: CouplePet['species']): CouplePet => ({ id, coupleId: 'couple', catalogKey: `${species}_starter`, species, speciesSource: 'catalog', name: id, xp: 0, level: 1, growthStage: 'baby', equippedSkinKey: null, isActive: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' });

describe('Couple Pet Booth adapter', () => {
  it('uses canonical asset resolution deterministically', () => {
    const placement = defaultBoothCompanionPlacement('tiger', 0);
    const [snapshot] = couplePetsToBoothCompanionSnapshots([pet('tiger', 'tiger')], [placement]);
    assert.equal(snapshot?.id, 'tiger'); assert.match(snapshot?.renderAsset.uri ?? '', /pets\/tiger\.png$/);
    assert.deepEqual(snapshot?.transform, { ...placement, rotation: 0 });
  });
  it('supports multiple transforms and skips deleted or invalid pets', () => {
    const placements = [defaultBoothCompanionPlacement('dog', 0), defaultBoothCompanionPlacement('cat', 1), defaultBoothCompanionPlacement('deleted', 2)];
    const snapshots = couplePetsToBoothCompanionSnapshots([pet('dog', 'dog'), pet('cat', 'cat'), pet('bad', null)], placements);
    assert.deepEqual(snapshots.map((item) => item.id), ['dog', 'cat']); assert.notEqual(snapshots[0]?.transform.x, snapshots[1]?.transform.x); assert.equal(snapshots[1]?.transform.flipX, true);
  });
});
