/**
 * The only Couple Booth module allowed to know the Couple Pet domain.
 * Booth renderers consume BoothCompanionSnapshot and canonical asset refs.
 */
import type {
  CouplePet as SharedCouplePet,
  PetBoothDecoration,
  PetBoothPoseKey,
  PetGrowthStage,
  PetInventoryItem,
  PetSpecies,
} from '@couplePet/types';
import {
  parsePetGrowthStage,
  progressFromTotalXp,
  requiredStageForPose,
  resolvePetSpecies,
  stageNumber,
} from '@couplePet/types';
import { clampPetDecorations, MAX_PET_DECORATIONS } from '@couplePet/decorations';
import { PET_POSE_LABELS, petPoseAsset } from '@couplePet/assets';
import type { BoothCompanionSnapshot } from '@shared/coupleBoothStage';
import type { BoothCompanionPlacement } from '@shared/companionState';

export type CouplePet = Omit<SharedCouplePet, 'species'> & {
  species: PetSpecies | null;
};

export type {
  PetBoothDecoration,
  PetBoothPoseKey,
  PetGrowthStage,
  PetInventoryItem,
  PetSpecies,
};

export {
  PET_POSE_LABELS,
  MAX_PET_DECORATIONS,
  clampPetDecorations,
  parsePetGrowthStage,
  petPoseAsset,
  progressFromTotalXp,
  requiredStageForPose,
  resolvePetSpecies,
  stageNumber,
};

export function petDecorationToCompanionSnapshot(
  decoration: PetBoothDecoration,
): BoothCompanionSnapshot {
  const asset = petPoseAsset(decoration.species, decoration.poseKey);
  return {
    id: decoration.id,
    type: decoration.species,
    expression: decoration.poseKey,
    renderAsset: { id: asset.key, uri: asset.webPath },
    transform: {
      x: decoration.x,
      y: decoration.y,
      scale: decoration.scale,
      rotation: decoration.rotationDeg,
      flipX: decoration.flipX,
    },
    zIndex: decoration.zIndex,
  };
}

export function petDecorationsToCompanionSnapshots(
  decorations: PetBoothDecoration[],
): BoothCompanionSnapshot[] {
  return clampPetDecorations(decorations).map(petDecorationToCompanionSnapshot);
}

/** Booth's single translation boundary from canonical Couple Pet to a generic stage companion. */
export function couplePetToBoothCompanionSnapshot(
  pet: CouplePet,
  placement: BoothCompanionPlacement,
  index = 0,
): BoothCompanionSnapshot | null {
  if (!pet.species || pet.id !== placement.petId) return null;
  const pose: PetBoothPoseKey = index % 2 === 0 ? 'sit_bottom_left' : 'sit_bottom_right';
  const asset = petPoseAsset(pet.species, pose);
  return {
    id: pet.id,
    type: pet.species,
    displayName: pet.name,
    expression: pose,
    renderAsset: { id: asset.key, uri: asset.webPath },
    transform: { ...placement, rotation: 0 },
    zIndex: placement.zIndex,
  };
}

export function couplePetsToBoothCompanionSnapshots(
  pets: CouplePet[],
  placements: BoothCompanionPlacement[],
): BoothCompanionSnapshot[] {
  const byId = new Map(pets.map((pet) => [pet.id, pet]));
  return placements.flatMap((placement, index) => {
    const pet = byId.get(placement.petId);
    if (!pet) return [];
    const snapshot = couplePetToBoothCompanionSnapshot(pet, placement, index);
    return snapshot ? [snapshot] : [];
  });
}

export function defaultBoothCompanionPlacement(petId: string, index: number): BoothCompanionPlacement {
  const twoPetX = index % 2 === 0 ? 0.2 : 0.8;
  return { petId, x: twoPetX, y: 0.94, scale: 0.17, flipX: index % 2 === 1, zIndex: index };
}
