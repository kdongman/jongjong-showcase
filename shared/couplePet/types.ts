/** Shared couple-pet domain — mobile + Couple Booth web. */

export const PET_SPECIES = ['dog', 'cat', 'tiger'] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];
export const PET_SPECIES_KEYS = ['jongjong_tiger', 'yorkie_dog'] as const;
export type PetSpeciesKey = (typeof PET_SPECIES_KEYS)[number];
export const PET_GROWTH_STAGES = ['baby', 'growing', 'adult'] as const;
export type PetGrowthStage = (typeof PET_GROWTH_STAGES)[number];
export type PetItemType = 'skin' | 'booth_pose' | 'frame';
export type PetItemSource = 'starter' | 'growth' | 'premium' | 'event' | 'purchase' | 'admin_grant';

export type PetXpEventType =
  | 'moment_share'
  | 'reaction'
  | 'comment'
  | 'booth_complete'
  | 'daily_together'
  | 'daily_checkin'
  | 'memory_create'
  | 'invite_accept'
  | 'room_petting'
  | 'room_treat'
  | 'room_play'
  | 'room_fetch';

export const PET_XP_REWARDS: Record<PetXpEventType, number> = {
  moment_share: 5,
  reaction: 2,
  comment: 3,
  booth_complete: 20,
  daily_together: 10,
  daily_checkin: 5,
  memory_create: 8,
  invite_accept: 15,
  room_petting: 1,
  room_treat: 1,
  room_play: 2,
  room_fetch: 2,
};

export const PET_NAME_MAX_LENGTH = 20;

export const PET_SPECIES_DISPLAY_FALLBACK: PetSpecies = 'dog';
export const PET_SPECIES_FALLBACK = PET_SPECIES_DISPLAY_FALLBACK;

export const KNOWN_PET_CATALOG_SPECIES: Readonly<Record<string, PetSpecies>> = {
  dog_starter: 'dog',
  cat_starter: 'cat',
  tiger_jongjong: 'tiger',
  yorkie_dog: 'dog',
};

export function isPetSpecies(value: unknown): value is PetSpecies {
  return typeof value === 'string' && (PET_SPECIES as readonly string[]).includes(value);
}

export function isPetGrowthStage(value: unknown): value is PetGrowthStage {
  return typeof value === 'string' && (PET_GROWTH_STAGES as readonly string[]).includes(value);
}

export function parsePetSpecies(value: unknown): PetSpecies | null {
  return isPetSpecies(value) ? value : null;
}

export function parsePetGrowthStage(value: unknown): PetGrowthStage | null {
  return isPetGrowthStage(value) ? value : null;
}

export function inferSpeciesFromCatalogKey(catalogKey: string): PetSpecies | null {
  return KNOWN_PET_CATALOG_SPECIES[catalogKey] ?? null;
}

export type ResolvePetSpeciesResult = {
  species: PetSpecies | null;
  source: 'catalog' | 'inferred' | 'invalid' | 'missing';
};

export function resolvePetSpecies(input: {
  species?: unknown;
  catalogKey?: unknown;
}): ResolvePetSpeciesResult {
  if (input.species !== undefined && input.species !== null && input.species !== '') {
    const species = parsePetSpecies(input.species);
    return species
      ? { species, source: 'catalog' }
      : { species: null, source: 'invalid' };
  }
  if (typeof input.catalogKey === 'string' && input.catalogKey.length > 0) {
    const species = inferSpeciesFromCatalogKey(input.catalogKey);
    return species
      ? { species, source: 'inferred' }
      : { species: null, source: 'missing' };
  }
  return { species: null, source: 'missing' };
}

export function speciesForDisplay(species: PetSpecies | null | undefined): PetSpecies {
  return species ?? PET_SPECIES_DISPLAY_FALLBACK;
}

export function isFreeSelectableCatalogItem(item: {
  isFree: boolean;
  isPremium: boolean;
  isActive: boolean;
  species: PetSpecies | null;
}): boolean {
  return item.isActive && item.isFree && !item.isPremium && isPetSpecies(item.species);
}

/** XP required to advance from level L to L+1 (L starts at 1). */
export function xpToAdvanceFromLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level));
  return 20 + (safe - 1) * 15;
}

export function growthStageForLevel(level: number): PetGrowthStage {
  if (level >= 10) return 'adult';
  if (level >= 5) return 'growing';
  return 'baby';
}

export function stageNumber(stage: PetGrowthStage): 1 | 2 | 3 {
  if (stage === 'adult') return 3;
  if (stage === 'growing') return 2;
  return 1;
}

export type LevelProgress = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
  stage: PetGrowthStage;
};

/**
 * UI-facing names for the same canonical level calculation. Keep all XP chip,
 * detail, and growth UI derived from this one helper.
 */
export type PetLevelProgress = LevelProgress & {
  currentLevelXp: number;
  xpRequiredForNextLevel: number;
};

/** Derive level/stage from cumulative XP. */
export function progressFromTotalXp(totalXp: number): LevelProgress {
  let remaining = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (remaining >= xpToAdvanceFromLevel(level)) {
    remaining -= xpToAdvanceFromLevel(level);
    level += 1;
    if (level > 99) break;
  }
  const need = xpToAdvanceFromLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel: need,
    progress: need <= 0 ? 1 : Math.min(1, remaining / need),
    stage: growthStageForLevel(level),
  };
}

export function getPetLevelProgress(totalXp: number): PetLevelProgress {
  const progress = progressFromTotalXp(totalXp);
  return {
    ...progress,
    currentLevelXp: progress.xpIntoLevel,
    xpRequiredForNextLevel: progress.xpForNextLevel,
  };
}

/** First level that belongs to a growth stage. */
export function minLevelForStage(stage: PetGrowthStage): number {
  if (stage === 'adult') return 10;
  if (stage === 'growing') return 5;
  return 1;
}

/** Cumulative XP required to *reach* a given level (level starts at 1 with 0 XP). */
export function totalXpToReachLevel(targetLevel: number): number {
  const safe = Math.max(1, Math.floor(targetLevel));
  let total = 0;
  for (let level = 1; level < safe; level += 1) {
    total += xpToAdvanceFromLevel(level);
  }
  return total;
}

export type StageProgress = {
  stage: PetGrowthStage;
  stageNum: 1 | 2 | 3;
  isMax: boolean;
  /** XP earned inside the current stage band. */
  xpIntoStage: number;
  /** XP span of the current stage band (0 when max). */
  xpForNextStage: number;
  /** 0–1 progress toward the next stage (1 when max). */
  progress: number;
  xpRemainingToNextStage: number;
  nextStage: PetGrowthStage | null;
};

/** Progress within the current growth stage toward the next stage threshold. */
export function stageProgressFromTotalXp(totalXp: number): StageProgress {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const { stage } = progressFromTotalXp(safeXp);
  const stageNum = stageNumber(stage);
  if (stage === 'adult') {
    return {
      stage,
      stageNum,
      isMax: true,
      xpIntoStage: Math.max(0, safeXp - totalXpToReachLevel(minLevelForStage('adult'))),
      xpForNextStage: 0,
      progress: 1,
      xpRemainingToNextStage: 0,
      nextStage: null,
    };
  }
  const nextStage: PetGrowthStage = stage === 'baby' ? 'growing' : 'adult';
  const startXp = totalXpToReachLevel(minLevelForStage(stage));
  const endXp = totalXpToReachLevel(minLevelForStage(nextStage));
  const span = Math.max(1, endXp - startXp);
  const into = Math.min(span, Math.max(0, safeXp - startXp));
  return {
    stage,
    stageNum,
    isMax: false,
    xpIntoStage: into,
    xpForNextStage: span,
    progress: Math.min(1, into / span),
    xpRemainingToNextStage: Math.max(0, endXp - safeXp),
    nextStage,
  };
}

export function sanitizePetName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, PET_NAME_MAX_LENGTH);
}

export function isValidPetName(name: string): boolean {
  const cleaned = sanitizePetName(name);
  return cleaned.length >= 1 && cleaned.length <= PET_NAME_MAX_LENGTH;
}

export type PetCatalogItem = {
  key: string;
  displayName: string;
  species: PetSpecies;
  defaultAssetKey: string;
  isFree: boolean;
  isPremium: boolean;
  isPurchasable: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type CouplePet = {
  id: string;
  coupleId: string;
  catalogKey: string;
  /** Stable app-level identity, kept separate from the DB catalog row. */
  speciesKey?: PetSpeciesKey | null;
  species: PetSpecies;
  /** Optional resolution metadata used by the Booth adapter. */
  speciesSource?: 'catalog' | 'inferred' | 'invalid' | 'missing';
  name: string;
  xp: number;
  level: number;
  growthStage: PetGrowthStage;
  equippedSkinKey: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PetItemCatalogEntry = {
  key: string;
  itemType: PetItemType;
  displayName: string;
  species: PetSpecies | 'any';
  requiredStage: PetGrowthStage;
  isPremium: boolean;
  assetKey: string;
};

export type PetInventoryItem = {
  id: string;
  coupleId: string;
  petId: string;
  itemKey: string;
  source: PetItemSource;
  acquiredAt: string;
};

export type PetXpEvent = {
  id: string;
  coupleId: string;
  petId: string | null;
  eventType: PetXpEventType;
  /** Semantic idempotency key, e.g. moment:{uuid} */
  sourceKey: string;
  xpDelta: number;
  createdAt: string;
};

export type PetBoothPoseKey =
  | 'sit_bottom_right'
  | 'sit_bottom_left'
  | 'peek_between'
  | 'on_head'
  | 'hold_camera'
  | 'heart_between';

export type PetBoothDecoration = {
  id: string;
  poseKey: PetBoothPoseKey;
  petId: string;
  catalogKey: string;
  species: PetSpecies;
  stage: PetGrowthStage;
  /** Normalized 0–1 relative to full strip canvas. */
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  flipX: boolean;
  zIndex: number;
};

export const STARTER_BOOTH_POSES: PetBoothPoseKey[] = ['sit_bottom_right', 'sit_bottom_left'];
export const GROWING_BOOTH_POSES: PetBoothPoseKey[] = ['peek_between', 'on_head'];
export const ADULT_BOOTH_POSES: PetBoothPoseKey[] = ['hold_camera', 'heart_between'];

export function posesUnlockedForStage(stage: PetGrowthStage): PetBoothPoseKey[] {
  if (stage === 'adult') return [...STARTER_BOOTH_POSES, ...GROWING_BOOTH_POSES, ...ADULT_BOOTH_POSES];
  if (stage === 'growing') return [...STARTER_BOOTH_POSES, ...GROWING_BOOTH_POSES];
  return [...STARTER_BOOTH_POSES];
}

export function requiredStageForPose(pose: PetBoothPoseKey): PetGrowthStage {
  if ((ADULT_BOOTH_POSES as string[]).includes(pose)) return 'adult';
  if ((GROWING_BOOTH_POSES as string[]).includes(pose)) return 'growing';
  return 'baby';
}
