import {
  resolveCutoutRoomPlacement,
  resolveSurfaceCutoutAttachment,
  type CouplePetRoom,
  type PetRoomItem,
  type PetRoomPetPlacement,
} from './room';
import type { PetGrowthStage, PetSpecies } from './types';

export const BOOTH_ROOM_WIDTH = 1200;
export const BOOTH_ROOM_HEIGHT = 900;
export const BOOTH_ROOM_CANONICAL_WIDTH = 390;
export const BOOTH_ROOM_CANONICAL_HEIGHT = 420;
/** Matches PetRoomScene's canonical behind/front split. */
export const BOOTH_ROOM_PARTICIPANT_Z = 50;

export type BoothRoomPetSnapshot = {
  id: string;
  name: string;
  species: PetSpecies;
  growthStage: PetGrowthStage;
  catalogKey: string;
  placement: PetRoomPetPlacement;
};

export type BoothRoomSnapshot = Readonly<{
  roomId: string;
  roomUpdatedAt: string;
  capturedAt: string;
  wallStyleId: CouplePetRoom['wallStyleId'];
  floorStyleId: CouplePetRoom['floorStyleId'];
  items: readonly Readonly<PetRoomItem>[];
  pets: readonly Readonly<BoothRoomPetSnapshot>[];
  includePets: boolean;
}>;

export type BoothRoomProjection = Readonly<{
  outputWidth: number;
  outputHeight: number;
  canonicalWidth: number;
  canonicalHeight: number;
  expandedWidth: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}>;

export type BoothRoomPlateSplit = Readonly<{
  back: readonly Readonly<PetRoomItem>[];
  front: readonly Readonly<PetRoomItem>[];
}>;

type SnapshotPet = Pick<BoothRoomPetSnapshot, 'id' | 'name' | 'species' | 'growthStage' | 'catalogKey'>;

function cloneItem(item: PetRoomItem): PetRoomItem {
  return {
    ...item,
    // Lock is editor-only and has no visual effect in a Booth snapshot.
    isLocked: undefined,
    photo: item.photo ? { ...item.photo } : null,
    cutout: item.cutout ? { ...item.cutout } : null,
  };
}

/** Capture only canonical, visually relevant saved Room state. */
export function createBoothRoomSnapshot(input: {
  room: CouplePetRoom;
  pets: readonly SnapshotPet[];
  includePets?: boolean;
  capturedAt?: string;
}): BoothRoomSnapshot {
  const includePets = input.includePets !== false;
  const items = input.room.items.map((source) => {
    const item = cloneItem(source);
    if (item.photo) Object.freeze(item.photo);
    if (item.cutout) Object.freeze(item.cutout);
    return Object.freeze(item);
  });
  const visible = new Set(input.room.visiblePetIds);
  const pets = includePets
    ? input.pets.filter((pet) => visible.has(pet.id)).map((pet, index) => ({
        ...pet,
        placement: { ...(input.room.petPlacements[pet.id] ?? { x: index % 2 === 0 ? 0.36 : 0.64, y: 0.76 }) },
      }))
    : [];
  return Object.freeze({
    roomId: input.room.id,
    roomUpdatedAt: input.room.updatedAt,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    wallStyleId: input.room.wallStyleId,
    floorStyleId: input.room.floorStyleId,
    items: Object.freeze(items),
    pets: Object.freeze(pets.map((pet) => Object.freeze({ ...pet, placement: Object.freeze(pet.placement) }))),
    includePets,
  });
}

/**
 * Deterministic 4:3 camera: preserve the full 390x420 Room and extend its wall/floor
 * horizontally to 560x420. This avoids stretching or device-dependent cropping.
 */
export function boothRoomProjection(
  outputWidth = BOOTH_ROOM_WIDTH,
  outputHeight = BOOTH_ROOM_HEIGHT,
): BoothRoomProjection {
  const scale = outputHeight / BOOTH_ROOM_CANONICAL_HEIGHT;
  const expandedWidth = outputWidth / scale;
  return Object.freeze({
    outputWidth,
    outputHeight,
    canonicalWidth: BOOTH_ROOM_CANONICAL_WIDTH,
    canonicalHeight: BOOTH_ROOM_CANONICAL_HEIGHT,
    expandedWidth,
    scale,
    offsetX: (expandedWidth - BOOTH_ROOM_CANONICAL_WIDTH) / 2,
    offsetY: 0,
  });
}

export function projectBoothRoomPoint(
  point: { x: number; y: number },
  projection = boothRoomProjection(),
): { x: number; y: number } {
  return {
    x: (projection.offsetX + point.x * projection.canonicalWidth) * projection.scale,
    y: (projection.offsetY + point.y * projection.canonicalHeight) * projection.scale,
  };
}

/**
 * Booth depth uses the participant plane (zIndex 50), not Wall/Floor placement.
 * Legacy wall-catalog items with low zIndex remain on the back plate naturally.
 */
export function splitBoothRoomPlates(snapshot: BoothRoomSnapshot): BoothRoomPlateSplit {
  const source = snapshot.items as readonly PetRoomItem[];
  const roomSize = { width: BOOTH_ROOM_CANONICAL_WIDTH, height: BOOTH_ROOM_CANONICAL_HEIGHT };
  const resolved = source.map((item) => {
    const placed = resolveCutoutRoomPlacement(item, source, roomSize);
    const surface = resolveSurfaceCutoutAttachment(item, source, roomSize);
    return surface ? { ...placed, rotation: surface.rotation, zIndex: surface.zIndex } : placed;
  });
  const ordered = resolved.map((item, index) => ({ item, index })).sort((a, b) => (
    a.item.zIndex - b.item.zIndex || a.index - b.index
  )).map(({ item }) => item);
  return Object.freeze({
    back: Object.freeze(ordered.filter((item) => item.zIndex < BOOTH_ROOM_PARTICIPANT_Z)),
    front: Object.freeze(ordered.filter((item) => item.zIndex >= BOOTH_ROOM_PARTICIPANT_Z)),
  });
}

export function canChangeBoothRoomSnapshot(currentShotIndex: number): boolean {
  return Number.isFinite(currentShotIndex) && currentShotIndex <= 0;
}
