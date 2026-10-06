import type { CouplePet } from './types';
import { normalizeRotationDegrees } from './roomTransform';

export const PET_ROOM_THEME_IDS = ['cozy_lavender', 'warm_cream', 'soft_night'] as const;
export type PetRoomThemeId = (typeof PET_ROOM_THEME_IDS)[number];

export const PET_ROOM_WALL_STYLE_IDS = ['legacy_lavender', 'warm_cream', 'soft_pink', 'lavender', 'sage', 'soft_blue', 'warm_gray', 'cream_dots', 'soft_night', 'clean_wall'] as const;
export type PetRoomWallStyleId = (typeof PET_ROOM_WALL_STYLE_IDS)[number];
export const PET_ROOM_FLOOR_STYLE_IDS = ['legacy_light_wood', 'light_wood', 'warm_wood', 'pale_neutral', 'soft_beige', 'muted_gray', 'soft_night', 'clean_floor'] as const;
export type PetRoomFloorStyleId = (typeof PET_ROOM_FLOOR_STYLE_IDS)[number];
export const DEFAULT_PET_ROOM_WALL_STYLE_ID: PetRoomWallStyleId = 'legacy_lavender';
export const DEFAULT_PET_ROOM_FLOOR_STYLE_ID: PetRoomFloorStyleId = 'legacy_light_wood';

export type PetRoomWallStyle = { id: PetRoomWallStyleId; color: string; warmth: string; panel: string; pattern: 'none' | 'dots' };
export type PetRoomFloorStyle = { id: PetRoomFloorStyleId; color: string; depth: string; board: string };

export const PET_ROOM_WALL_STYLES: Record<PetRoomWallStyleId, PetRoomWallStyle> = {
  legacy_lavender: { id: 'legacy_lavender', color: '#EFE8F5', warmth: 'rgba(255,236,214,0.28)', panel: 'rgba(168,148,196,0.14)', pattern: 'none' },
  warm_cream: { id: 'warm_cream', color: '#F7EFE0', warmth: 'rgba(255,220,168,0.26)', panel: 'rgba(170,138,108,0.16)', pattern: 'none' },
  soft_pink: { id: 'soft_pink', color: '#F6E5E9', warmth: 'rgba(255,224,205,0.24)', panel: 'rgba(190,139,155,0.13)', pattern: 'none' },
  lavender: { id: 'lavender', color: '#EAE3F3', warmth: 'rgba(255,238,220,0.20)', panel: 'rgba(146,126,180,0.14)', pattern: 'none' },
  sage: { id: 'sage', color: '#E2EADF', warmth: 'rgba(255,239,205,0.18)', panel: 'rgba(111,143,116,0.13)', pattern: 'none' },
  soft_blue: { id: 'soft_blue', color: '#E3EDF3', warmth: 'rgba(255,238,218,0.16)', panel: 'rgba(113,145,166,0.13)', pattern: 'none' },
  warm_gray: { id: 'warm_gray', color: '#E9E5E0', warmth: 'rgba(255,233,207,0.18)', panel: 'rgba(137,126,116,0.13)', pattern: 'none' },
  cream_dots: { id: 'cream_dots', color: '#F5EDDF', warmth: 'rgba(255,222,181,0.20)', panel: 'rgba(176,142,112,0.13)', pattern: 'dots' },
  soft_night: { id: 'soft_night', color: '#34364A', warmth: 'rgba(196,176,255,0.10)', panel: 'rgba(226,220,255,0.11)', pattern: 'none' },
  clean_wall: { id: 'clean_wall', color: '#F8F5F2', warmth: 'transparent', panel: 'transparent', pattern: 'none' },
};

export const PET_ROOM_FLOOR_STYLES: Record<PetRoomFloorStyleId, PetRoomFloorStyle> = {
  legacy_light_wood: { id: 'legacy_light_wood', color: '#E4D8C8', depth: 'rgba(150,128,108,0.18)', board: 'rgba(130,104,82,0.11)' },
  light_wood: { id: 'light_wood', color: '#E8DCC9', depth: 'rgba(158,125,91,0.16)', board: 'rgba(143,110,78,0.13)' },
  warm_wood: { id: 'warm_wood', color: '#D9BE9F', depth: 'rgba(127,88,57,0.20)', board: 'rgba(116,75,47,0.16)' },
  pale_neutral: { id: 'pale_neutral', color: '#E8E4DD', depth: 'rgba(125,117,108,0.13)', board: 'rgba(122,114,105,0.08)' },
  soft_beige: { id: 'soft_beige', color: '#E2D2BA', depth: 'rgba(160,128,96,0.16)', board: 'rgba(131,96,66,0.11)' },
  muted_gray: { id: 'muted_gray', color: '#D8D7D5', depth: 'rgba(102,101,103,0.15)', board: 'rgba(94,93,96,0.10)' },
  soft_night: { id: 'soft_night', color: '#3F3B4C', depth: 'rgba(20,18,32,0.24)', board: 'rgba(226,220,255,0.05)' },
  clean_floor: { id: 'clean_floor', color: '#F8F5F2', depth: 'transparent', board: 'transparent' },
};

export type PetRoomPresetId = 'cozy' | 'minimal' | 'soft_pink' | 'calm' | 'night' | 'clean';
export type PetRoomPreset = { id: PetRoomPresetId; wallStyleId: PetRoomWallStyleId; floorStyleId: PetRoomFloorStyleId };
export const PET_ROOM_PRESETS: Record<PetRoomPresetId, PetRoomPreset> = {
  cozy: { id: 'cozy', wallStyleId: 'warm_cream', floorStyleId: 'warm_wood' },
  minimal: { id: 'minimal', wallStyleId: 'warm_gray', floorStyleId: 'pale_neutral' },
  soft_pink: { id: 'soft_pink', wallStyleId: 'soft_pink', floorStyleId: 'soft_beige' },
  calm: { id: 'calm', wallStyleId: 'sage', floorStyleId: 'light_wood' },
  night: { id: 'night', wallStyleId: 'soft_night', floorStyleId: 'soft_night' },
  clean: { id: 'clean', wallStyleId: 'clean_wall', floorStyleId: 'clean_floor' },
};

export function appearanceForLegacyTheme(themeId: PetRoomThemeId): { wallStyleId: PetRoomWallStyleId; floorStyleId: PetRoomFloorStyleId } {
  if (themeId === 'warm_cream') return { wallStyleId: 'warm_cream', floorStyleId: 'soft_beige' };
  if (themeId === 'soft_night') return { wallStyleId: 'soft_night', floorStyleId: 'soft_night' };
  return { wallStyleId: DEFAULT_PET_ROOM_WALL_STYLE_ID, floorStyleId: DEFAULT_PET_ROOM_FLOOR_STYLE_ID };
}

export function normalizePetRoomWallStyleId(value: unknown): PetRoomWallStyleId {
  return PET_ROOM_WALL_STYLE_IDS.includes(value as PetRoomWallStyleId) ? value as PetRoomWallStyleId : DEFAULT_PET_ROOM_WALL_STYLE_ID;
}

export function normalizePetRoomFloorStyleId(value: unknown): PetRoomFloorStyleId {
  return PET_ROOM_FLOOR_STYLE_IDS.includes(value as PetRoomFloorStyleId) ? value as PetRoomFloorStyleId : DEFAULT_PET_ROOM_FLOOR_STYLE_ID;
}

export function applyPetRoomAppearance<T extends { wallStyleId: PetRoomWallStyleId; floorStyleId: PetRoomFloorStyleId; items: PetRoomItem[] }>(
  room: T,
  patch: Partial<Pick<T, 'wallStyleId' | 'floorStyleId'>>,
): T {
  return {
    ...room,
    wallStyleId: patch.wallStyleId == null ? room.wallStyleId : normalizePetRoomWallStyleId(patch.wallStyleId),
    floorStyleId: patch.floorStyleId == null ? room.floorStyleId : normalizePetRoomFloorStyleId(patch.floorStyleId),
  };
}

export function applyPetRoomPreset<T extends { wallStyleId: PetRoomWallStyleId; floorStyleId: PetRoomFloorStyleId; items: PetRoomItem[] }>(room: T, presetId: PetRoomPresetId): T {
  return applyPetRoomAppearance(room, PET_ROOM_PRESETS[presetId]);
}

export function resetPetRoomAppearance<T extends { wallStyleId: PetRoomWallStyleId; floorStyleId: PetRoomFloorStyleId; items: PetRoomItem[] }>(room: T): T {
  return applyPetRoomAppearance(room, { wallStyleId: DEFAULT_PET_ROOM_WALL_STYLE_ID, floorStyleId: DEFAULT_PET_ROOM_FLOOR_STYLE_ID });
}

export type PetRoomPlacementType = 'wall' | 'floor' | 'rug';
export const PET_ROOM_CUTOUT_PLACEMENT_TYPES = ['floor', 'surface', 'wall'] as const;
export type PetRoomCutoutPlacementType = (typeof PET_ROOM_CUTOUT_PLACEMENT_TYPES)[number];
export type PetRoomItemCategory = 'furniture' | 'decor' | 'memories' | 'text';
export type PetRoomItemKind = 'bed' | 'bowl' | 'toy' | 'plant' | 'shelf' | 'side_table' | 'sofa' | 'console' | 'dresser' | 'floor_lamp' | 'wall_art' | 'cushion' | 'accent_rug' | 'table_lamp' | 'vase' | 'plush' | 'wall_poster' | 'string_lights' | 'small_plant' | 'keepsake' | 'photo_frame' | 'photo_strip_frame' | 'cutout' | 'text' | 'play_kuji' | 'play_truth_dare' | 'play_question_jar' | 'play_secret_mission' | 'for_you_bundle' | 'game_table' | 'play_drawing_set' | 'play_drawing_games' | 'play_roulette' | 'play_balance_game';

/** Play fixtures that live in Game Room — never shown in Our Room editing. */
export const GAME_ROOM_ONLY_ITEM_KINDS = [
  'game_table',
  'play_drawing_set',
  // Rolling-deploy alias. Migration 20260825040637 converts it to game_table.
  'play_drawing_games',
  'play_kuji',
  'play_truth_dare',
  'play_question_jar',
  'play_secret_mission',
  'for_you_bundle',
  'play_roulette',
  'play_balance_game',
] as const satisfies readonly PetRoomItemKind[];

export function isGameRoomOnlyItemKind(kind: PetRoomItemKind): boolean {
  return (GAME_ROOM_ONLY_ITEM_KINDS as readonly string[]).includes(kind);
}
export type PetRoomPhotoSourceType = 'upload' | 'moment' | 'couple_booth';
export const PET_ROOM_FRAME_SIZES = ['small', 'medium', 'large'] as const;
export type PetRoomFrameSize = (typeof PET_ROOM_FRAME_SIZES)[number];
export const PET_ROOM_FRAME_STYLES = ['square', 'classic', 'polaroid', 'rounded', 'minimal'] as const;
export type PetRoomFrameStyle = (typeof PET_ROOM_FRAME_STYLES)[number];

export type PetRoomTheme = {
  id: PetRoomThemeId;
  wall: string;
  wallWarmth: string;
  floor: string;
  floorDepth: string;
  panel: string;
  rug: string;
};

export const PET_ROOM_THEMES: Record<PetRoomThemeId, PetRoomTheme> = {
  cozy_lavender: { id: 'cozy_lavender', wall: '#EFE8F5', wallWarmth: 'rgba(255,236,214,0.28)', floor: '#E4D8C8', floorDepth: 'rgba(150,128,108,0.18)', panel: 'rgba(168,148,196,0.14)', rug: '#E6D2BC' },
  warm_cream: { id: 'warm_cream', wall: '#F7EFE0', wallWarmth: 'rgba(255,220,168,0.26)', floor: '#E2D2BA', floorDepth: 'rgba(160,128,96,0.16)', panel: 'rgba(170,138,108,0.16)', rug: '#E0C8AE' },
  soft_night: { id: 'soft_night', wall: '#34364A', wallWarmth: 'rgba(196,176,255,0.10)', floor: '#3F3B4C', floorDepth: 'rgba(20,18,32,0.24)', panel: 'rgba(226,220,255,0.11)', rug: '#5E5672' },
};

export type PetRoomCatalogItem = {
  id: PetRoomItemKind;
  category: PetRoomItemCategory;
  placement: PetRoomPlacementType;
  defaultScale: number;
  minScale: number;
  maxScale: number;
  removable: boolean;
  functional: boolean;
  allowMultiple: boolean;
  defaultX: number;
  defaultY: number;
  zIndex: number;
  scalable: boolean;
  rotatable: boolean;
  duplicatable: boolean;
};

/**
 * Pet depth band from resolvePetPlacementDepth (~48…88). Soft floor mats must
 * stay strictly under that band — bring-to-front must never bury pets.
 */
export const PET_ROOM_PET_Z_MIN = 48;
export const PET_ROOM_SOFT_FLOOR_Z_MAX = PET_ROOM_PET_Z_MIN - 1;

/**
 * The original centre rug is a system decoration, but it persists through the
 * existing accent-rug item row. This reserved depth keeps its old visual
 * treatment separate from catalogue rugs without adding a schema field.
 */
export const BUILT_IN_CENTER_RUG_Z_INDEX = 3;
export const HIDDEN_BUILT_IN_CENTER_RUG_Z_INDEX = 0;

export function isBuiltInCenterRug(item: Pick<PetRoomItem, 'catalogItemId'> & Partial<Pick<PetRoomItem, 'zIndex' | 'isLocked'>>): boolean {
  return item.catalogItemId === 'accent_rug'
    && (item.zIndex === BUILT_IN_CENTER_RUG_Z_INDEX
      || (item.zIndex === HIDDEN_BUILT_IN_CENTER_RUG_Z_INDEX && item.isLocked === true));
}

export function isHiddenBuiltInCenterRug(item: Pick<PetRoomItem, 'catalogItemId'> & Partial<Pick<PetRoomItem, 'zIndex' | 'isLocked'>>): boolean {
  return isBuiltInCenterRug(item) && item.isLocked === true;
}

/** Adds the legacy fixed rug to an edit draft without changing existing rows. */
export function materializeBuiltInCenterRug(
  items: readonly PetRoomItem[],
  input: { roomId: string; y: number },
): PetRoomItem[] {
  if (items.some(isBuiltInCenterRug)) return [...items];
  const now = new Date(0).toISOString();
  return [...items, {
    id: `local-built-in-center-rug-${input.roomId}`,
    roomId: input.roomId,
    catalogItemId: 'accent_rug',
    sceneKey: 'main',
    x: 0.5,
    y: input.y,
    scale: 1,
    rotation: 0,
    flipX: false,
    zIndex: BUILT_IN_CENTER_RUG_Z_INDEX,
    isLocked: false,
    photo: null,
    cutout: null,
    frameSize: null,
    frameStyle: null,
    normalizedWidth: null,
    normalizedHeight: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  }];
}

/** Accent rugs are floor mats; toys share placement:'rug' but sit near pets. */
export function isSoftFloorRoomItemKind(kind: PetRoomItemKind): boolean {
  return kind === 'accent_rug';
}

export function clampRoomItemZIndex(kind: PetRoomItemKind, zIndex: number): number {
  const rounded = Math.max(0, Math.min(100, Math.round(Number.isFinite(zIndex) ? zIndex : 0)));
  if (isSoftFloorRoomItemKind(kind)) return Math.min(rounded, PET_ROOM_SOFT_FLOOR_Z_MAX);
  return rounded;
}

export const PET_ROOM_CATALOG: Record<PetRoomItemKind, PetRoomCatalogItem> = {
  bed: { id: 'bed', category: 'furniture', placement: 'floor', defaultScale: 1, minScale: 0.75, maxScale: 1.35, removable: true, functional: true, allowMultiple: false, defaultX: 0.16, defaultY: 0.58, zIndex: 40, scalable: true, rotatable: false, duplicatable: false },
  bowl: { id: 'bowl', category: 'furniture', placement: 'floor', defaultScale: 1, minScale: 0.75, maxScale: 1.3, removable: true, functional: true, allowMultiple: false, defaultX: 0.86, defaultY: 0.74, zIndex: 41, scalable: true, rotatable: false, duplicatable: false },
  toy: { id: 'toy', category: 'decor', placement: 'rug', defaultScale: 1, minScale: 0.75, maxScale: 1.4, removable: true, functional: true, allowMultiple: false, defaultX: 0.22, defaultY: 0.82, zIndex: 60, scalable: true, rotatable: true, duplicatable: false },
  plant: { id: 'plant', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.7, maxScale: 1.35, removable: true, functional: false, allowMultiple: true, defaultX: 0.09, defaultY: 0.48, zIndex: 32, scalable: true, rotatable: true, duplicatable: true },
  shelf: { id: 'shelf', category: 'furniture', placement: 'floor', defaultScale: 1, minScale: 0.75, maxScale: 1.4, removable: true, functional: false, allowMultiple: true, defaultX: 0.72, defaultY: 0.58, zIndex: 38, scalable: true, rotatable: true, duplicatable: true },
  side_table: { id: 'side_table', category: 'furniture', placement: 'floor', defaultScale: 1, minScale: 0.75, maxScale: 1.4, removable: true, functional: false, allowMultiple: true, defaultX: 0.78, defaultY: 0.65, zIndex: 39, scalable: true, rotatable: true, duplicatable: true },
  sofa: { id: 'sofa', category: 'furniture', placement: 'floor', defaultScale: 1, minScale: 0.7, maxScale: 1.35, removable: true, functional: false, allowMultiple: true, defaultX: 0.50, defaultY: 0.61, zIndex: 40, scalable: true, rotatable: true, duplicatable: true },
  console: { id: 'console', category: 'furniture', placement: 'floor', defaultScale: 1, minScale: 0.7, maxScale: 1.4, removable: true, functional: false, allowMultiple: true, defaultX: 0.68, defaultY: 0.57, zIndex: 37, scalable: true, rotatable: true, duplicatable: true },
  dresser: { id: 'dresser', category: 'furniture', placement: 'floor', defaultScale: 1, minScale: 0.7, maxScale: 1.4, removable: true, functional: false, allowMultiple: true, defaultX: 0.23, defaultY: 0.59, zIndex: 38, scalable: true, rotatable: true, duplicatable: true },
  floor_lamp: { id: 'floor_lamp', category: 'furniture', placement: 'floor', defaultScale: 1, minScale: 0.7, maxScale: 1.4, removable: true, functional: false, allowMultiple: true, defaultX: 0.88, defaultY: 0.56, zIndex: 36, scalable: true, rotatable: true, duplicatable: true },
  wall_art: { id: 'wall_art', category: 'decor', placement: 'wall', defaultScale: 1, minScale: 0.65, maxScale: 1.5, removable: true, functional: false, allowMultiple: true, defaultX: 0.86, defaultY: 0.18, zIndex: 10, scalable: true, rotatable: true, duplicatable: true },
  cushion: { id: 'cushion', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.6, maxScale: 1.5, removable: true, functional: false, allowMultiple: true, defaultX: 0.58, defaultY: 0.72, zIndex: 55, scalable: true, rotatable: true, duplicatable: true },
  accent_rug: { id: 'accent_rug', category: 'decor', placement: 'rug', defaultScale: 1, minScale: 0.65, maxScale: 1.5, removable: true, functional: false, allowMultiple: true, defaultX: 0.50, defaultY: 0.78, zIndex: 20, scalable: true, rotatable: true, duplicatable: true },
  table_lamp: { id: 'table_lamp', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.6, maxScale: 1.5, removable: true, functional: false, allowMultiple: true, defaultX: 0.72, defaultY: 0.67, zIndex: 48, scalable: true, rotatable: true, duplicatable: true },
  vase: { id: 'vase', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.6, maxScale: 1.5, removable: true, functional: false, allowMultiple: true, defaultX: 0.62, defaultY: 0.70, zIndex: 48, scalable: true, rotatable: true, duplicatable: true },
  plush: { id: 'plush', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.6, maxScale: 1.5, removable: true, functional: false, allowMultiple: true, defaultX: 0.32, defaultY: 0.75, zIndex: 54, scalable: true, rotatable: true, duplicatable: true },
  wall_poster: { id: 'wall_poster', category: 'decor', placement: 'wall', defaultScale: 1, minScale: 0.6, maxScale: 1.6, removable: true, functional: false, allowMultiple: true, defaultX: 0.24, defaultY: 0.21, zIndex: 9, scalable: true, rotatable: true, duplicatable: true },
  string_lights: { id: 'string_lights', category: 'decor', placement: 'wall', defaultScale: 1, minScale: 0.65, maxScale: 1.5, removable: true, functional: false, allowMultiple: true, defaultX: 0.52, defaultY: 0.12, zIndex: 8, scalable: true, rotatable: true, duplicatable: true },
  small_plant: { id: 'small_plant', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.6, maxScale: 1.5, removable: true, functional: false, allowMultiple: true, defaultX: 0.82, defaultY: 0.68, zIndex: 47, scalable: true, rotatable: true, duplicatable: true },
  keepsake: { id: 'keepsake', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.6, maxScale: 1.5, removable: true, functional: false, allowMultiple: true, defaultX: 0.45, defaultY: 0.72, zIndex: 48, scalable: true, rotatable: true, duplicatable: true },
  photo_frame: { id: 'photo_frame', category: 'memories', placement: 'wall', defaultScale: 1, minScale: 0.65, maxScale: 1.6, removable: true, functional: false, allowMultiple: true, defaultX: 0.76, defaultY: 0.18, zIndex: 11, scalable: true, rotatable: true, duplicatable: true },
  photo_strip_frame: { id: 'photo_strip_frame', category: 'memories', placement: 'wall', defaultScale: 1, minScale: 0.65, maxScale: 1.6, removable: true, functional: false, allowMultiple: true, defaultX: 0.88, defaultY: 0.30, zIndex: 11, scalable: true, rotatable: true, duplicatable: true },
  cutout: { id: 'cutout', category: 'memories', placement: 'floor', defaultScale: 1, minScale: 0.35, maxScale: 2.2, removable: true, functional: false, allowMultiple: true, defaultX: 0.5, defaultY: 0.72, zIndex: 49, scalable: true, rotatable: true, duplicatable: true },
  text: { id: 'text', category: 'text', placement: 'floor', defaultScale: 1, minScale: 0.45, maxScale: 2.2, removable: true, functional: false, allowMultiple: true, defaultX: 0.52, defaultY: 0.36, zIndex: 58, scalable: true, rotatable: true, duplicatable: true },
  /** Wall-mounted lottery board. Legacy floor placements keep stored x/y. */
  play_kuji: { id: 'play_kuji', category: 'decor', placement: 'wall', defaultScale: 1, minScale: 0.65, maxScale: 1.7, removable: true, functional: true, allowMultiple: false, defaultX: 0.78, defaultY: 0.22, zIndex: 12, scalable: true, rotatable: true, duplicatable: false },
  play_truth_dare: { id: 'play_truth_dare', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.7, maxScale: 1.5, removable: true, functional: true, allowMultiple: false, defaultX: 0.52, defaultY: 0.64, zIndex: 51, scalable: true, rotatable: true, duplicatable: false },
  play_question_jar: { id: 'play_question_jar', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.7, maxScale: 1.7, removable: true, functional: true, allowMultiple: false, defaultX: 0.70, defaultY: 0.68, zIndex: 51, scalable: true, rotatable: true, duplicatable: false },
  play_secret_mission: { id: 'play_secret_mission', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.7, maxScale: 1.5, removable: true, functional: true, allowMultiple: false, defaultX: 0.82, defaultY: 0.62, zIndex: 51, scalable: true, rotatable: true, duplicatable: false },
  for_you_bundle: { id: 'for_you_bundle', category: 'decor', placement: 'floor', defaultScale: 1, minScale: 0.7, maxScale: 1.45, removable: true, functional: true, allowMultiple: false, defaultX: 0.58, defaultY: 0.70, zIndex: 51, scalable: true, rotatable: true, duplicatable: false },
  game_table: { id: 'game_table', category: 'furniture', placement: 'floor', defaultScale: 1.2, minScale: 0.9, maxScale: 1.8, removable: true, functional: false, allowMultiple: false, defaultX: 0.50, defaultY: 0.66, zIndex: 48, scalable: true, rotatable: true, duplicatable: false },
  /** Storage id is retained for existing rooms; the visible product is Drawing Board. */
  play_drawing_set: { id: 'play_drawing_set', category: 'decor', placement: 'wall', defaultScale: 1, minScale: 0.65, maxScale: 1.75, removable: true, functional: true, allowMultiple: false, defaultX: 0.50, defaultY: 0.43, zIndex: 13, scalable: true, rotatable: true, duplicatable: false },
  /** Legacy storage alias for Game Table during a rolling migration. Never launches Drawing. */
  play_drawing_games: { id: 'play_drawing_games', category: 'furniture', placement: 'floor', defaultScale: 1.2, minScale: 0.9, maxScale: 1.8, removable: true, functional: false, allowMultiple: false, defaultX: 0.50, defaultY: 0.66, zIndex: 48, scalable: true, rotatable: true, duplicatable: false },
  play_roulette: { id: 'play_roulette', category: 'decor', placement: 'wall', defaultScale: 1.25, minScale: 0.7, maxScale: 2.8, removable: true, functional: true, allowMultiple: false, defaultX: 0.76, defaultY: 0.24, zIndex: 12, scalable: true, rotatable: true, duplicatable: false },
  play_balance_game: { id: 'play_balance_game', category: 'decor', placement: 'wall', defaultScale: 1.05, minScale: 0.7, maxScale: 2.1, removable: true, functional: true, allowMultiple: false, defaultX: 0.50, defaultY: 0.22, zIndex: 12, scalable: true, rotatable: true, duplicatable: false },
};

export type PetRoomPhoto = {
  sourceType: PetRoomPhotoSourceType;
  sourceId: string | null;
  bucket: 'couple-pet-rooms' | 'couple-logs' | 'couple-booth';
  path: string;
  width: number | null;
  height: number | null;
  focalX: number;
  focalY: number;
  zoom: number;
  signedUrl?: string;
};

export type PetRoomCutoutAsset = {
  bucket: 'couple-pet-rooms';
  path: string;
  width: number;
  height: number;
  /** Horizontal point on the bitmap aligned to x (0...1). */
  anchorX: number;
  /** Vertical point aligned to y. V1 uses the lowest visible alpha pixel (= 1). */
  anchorY: number;
  signedUrl?: string;
};

/**
 * Couple-supplied artwork that replaces a functional object's built-in look.
 * Geometry, collisions and behaviour stay with the object: only pixels change,
 * so a skinned mailbox still receives letters and a skinned Kuji box still opens.
 */
export type PetRoomObjectSkin = {
  /** Canonical `couple_cutout_assets` identity the skin reuses. */
  assetId: string;
  bucket: 'couple-pet-rooms';
  path: string;
  width: number;
  height: number;
  signedUrl?: string;
};

/** Kinds whose own image already is the object, so a skin would be meaningless. */
const UNSKINNABLE_ROOM_ITEM_KINDS = ['cutout', 'text', 'photo_frame', 'photo_strip_frame'] as const;

export function canSkinRoomObject(kind: PetRoomItemKind): boolean {
  return !includesValue(UNSKINNABLE_ROOM_ITEM_KINDS, kind);
}

export function normalizeRoomObjectSkin(
  raw: Partial<PetRoomObjectSkin> | null | undefined,
): PetRoomObjectSkin | null {
  if (!raw?.assetId || !raw.path) return null;
  return {
    assetId: String(raw.assetId),
    bucket: 'couple-pet-rooms',
    path: String(raw.path),
    width: Math.max(1, Number(raw.width ?? 1)),
    height: Math.max(1, Number(raw.height ?? 1)),
    signedUrl: raw.signedUrl,
  };
}

export const PET_ROOM_TEXT_PRESETS = ['plain', 'sign', 'note'] as const;
export type PetRoomTextPreset = (typeof PET_ROOM_TEXT_PRESETS)[number];
export const PET_ROOM_TEXT_FONT_PRESETS = ['soft', 'rounded', 'handwritten', 'classic', 'bold', 'tiny'] as const;
export type PetRoomTextFontPreset = (typeof PET_ROOM_TEXT_FONT_PRESETS)[number];
export const PET_ROOM_TEXT_COLOR_IDS = ['cream', 'cocoa', 'lavender', 'rose', 'charcoal'] as const;
export type PetRoomTextColorId = (typeof PET_ROOM_TEXT_COLOR_IDS)[number];
export const PET_ROOM_TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type PetRoomTextAlign = (typeof PET_ROOM_TEXT_ALIGNS)[number];
export const PET_ROOM_SIGN_SURFACE_IDS = ['wood', 'cream', 'lavender', 'pink'] as const;
export type PetRoomSignSurfaceId = (typeof PET_ROOM_SIGN_SURFACE_IDS)[number];
export const PET_ROOM_NOTE_SURFACE_IDS = ['cream', 'lavender', 'pink'] as const;
export type PetRoomNoteSurfaceId = (typeof PET_ROOM_NOTE_SURFACE_IDS)[number];

export const PET_ROOM_TEXT_COLORS: Record<PetRoomTextColorId, string> = {
  cream: '#F7EFE0',
  cocoa: '#5C4638',
  lavender: '#65508E',
  rose: '#A96D83',
  charcoal: '#332E3D',
};

export const PET_ROOM_SIGN_SURFACES: Record<PetRoomSignSurfaceId, { fill: string; edge: string; inset: string }> = {
  wood: { fill: '#C9A07A', edge: '#8D6848', inset: '#E6CBA8' },
  cream: { fill: '#F3E6D0', edge: '#D4C0A4', inset: '#FFF8EC' },
  lavender: { fill: '#D9CDE8', edge: '#A78BC4', inset: '#F4EEFA' },
  pink: { fill: '#E9C5CE', edge: '#C48A98', inset: '#F8E8EC' },
};

export const PET_ROOM_NOTE_SURFACES: Record<PetRoomNoteSurfaceId, { fill: string; edge: string }> = {
  cream: { fill: '#F7E7C6', edge: '#E2CFA0' },
  lavender: { fill: '#E7DFF2', edge: '#C9B8DE' },
  pink: { fill: '#F4D5DC', edge: '#E0B4BE' },
};

export const ROOM_DISPLAY_NAME_MAX_LENGTH = 24;
export const ROOM_TEXT_BODY_MAX_LENGTH = 500;
export const ROOM_TEXT_FONT_SIZE_MIN = 10;
export const ROOM_TEXT_FONT_SIZE_MAX = 36;

export const ROOM_TITLE_STYLE_PRESETS = ['clean', 'rounded', 'handwritten', 'classic'] as const;
export type RoomTitleStylePreset = (typeof ROOM_TITLE_STYLE_PRESETS)[number];
export const ROOM_TITLE_COLOR_IDS = ['charcoal', 'lavender', 'rose', 'cocoa'] as const;
export type RoomTitleColorId = (typeof ROOM_TITLE_COLOR_IDS)[number];
export const ROOM_TITLE_COLORS: Record<RoomTitleColorId, string> = {
  charcoal: '#433A49', lavender: '#65508E', rose: '#A96D83', cocoa: '#5C4638',
};
export const ROOM_TITLE_FONT_SIZE_MIN = 16;
export const ROOM_TITLE_FONT_SIZE_MAX = 30;

export type RoomTitleStyle = {
  preset: RoomTitleStylePreset;
  fontSize: number;
  color: RoomTitleColorId;
  visible: boolean;
};

export const DEFAULT_ROOM_TITLE_STYLE: RoomTitleStyle = {
  preset: 'clean', fontSize: 20, color: 'charcoal', visible: true,
};

export type PetRoomTextObject = {
  body: string;
  preset: PetRoomTextPreset;
  fontPreset: PetRoomTextFontPreset;
  /** Typography size is independent from the canvas item's transform scale. */
  fontSize: number;
  /** Canonical arbitrary RGB value. Legacy preset IDs normalize to #RRGGBB. */
  color: string;
  /** Null means an explicitly transparent/no-background text object. */
  backgroundColor: string | null;
  align: PetRoomTextAlign;
  surfacePreset?: PetRoomSignSurfaceId | PetRoomNoteSurfaceId;
};

export type CoupleCutoutAssetSourceType = 'camera' | 'photo_library' | 'files' | 'booth' | 'legacy';

/** Couple-owned image identity. Room transforms intentionally do not live here. */
export type CoupleCutoutAsset = PetRoomCutoutAsset & {
  id: string;
  coupleId: string;
  createdBy: string;
  sourceType: CoupleCutoutAssetSourceType;
  activePlacementCount: number;
  createdAt: string;
  updatedAt: string;
};

export const PET_ROOM_ITEM_SCENE_KEYS = ['main', 'bedroom'] as const;

/** Which scene of a room an item decorates. Legacy rows are Main. */
export type PetRoomItemSceneKey = typeof PET_ROOM_ITEM_SCENE_KEYS[number];

export function normalizeRoomItemSceneKey(value: unknown): PetRoomItemSceneKey {
  return includesValue(PET_ROOM_ITEM_SCENE_KEYS, value) ? value : 'main';
}

export type PetRoomItem = {
  id: string;
  roomId: string;
  catalogItemId: PetRoomItemKind;
  /** Scene the item belongs to. Missing on legacy rows means the Main room. */
  sceneKey?: PetRoomItemSceneKey;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Content-only horizontal mirror. Persisted independently from scale magnitude. */
  flipX: boolean;
  zIndex: number;
  /** Locked items remain visible but ignore canvas transforms until explicitly unlocked. */
  isLocked?: boolean;
  /**
   * A couple-uploaded Cutout can become a semantic sleeping surface. Its
   * transformed visual bounds define the drop/rest area for room pets.
   */
  sleepSurfaceEnabled?: boolean;
  photo: PetRoomPhoto | null;
  /** Canonical couple-log reference shown by the Drawing Board. Media is never copied into the Room row. */
  displayDrawingId?: string | null;
  /** Transient, access-checked media resolved from displayDrawingId while loading the Room. */
  displayDrawing?: PetRoomPhoto | null;
  cutout: PetRoomCutoutAsset | null;
  /** Canonical reusable image identity. Null only for rolling-deploy legacy rows. */
  cutoutAssetId?: string | null;
  /** Couple-chosen artwork drawn instead of the built-in look. Behaviour is unchanged. */
  skin?: PetRoomObjectSkin | null;
  /** Missing on legacy rows means floor. Only meaningful for Cutouts. */
  placementType?: PetRoomCutoutPlacementType;
  /** Canonical room-item host for Surface Cutouts. */
  surfaceHostItemId?: string | null;
  surfaceId?: string | null;
  /** Host-surface local coordinate. Never an absolute screen pixel. */
  surfaceLocalX?: number | null;
  frameSize: PetRoomFrameSize | null;
  frameStyle: PetRoomFrameStyle | null;
  /** Freeform frame width as a fraction of usable wall width. Null = legacy S/M/L geometry. */
  normalizedWidth?: number | null;
  /** Freeform frame height as a fraction of usable wall height. Null = legacy S/M/L geometry. */
  normalizedHeight?: number | null;
  /** Present only for catalogItemId === 'text'. */
  textObject?: PetRoomTextObject | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PetRoomPlacementSurface = {
  id: string;
  /** Fractions of the host visual width from its center. */
  localXMin: number;
  localXMax: number;
  /** Fraction of host visual height from its center; -0.5 is the top edge. */
  baselineY: number;
  /** Fraction of host visual width available to placed content. */
  usableWidth: number;
};

/** Deliberately sparse: only furniture with a real, usable top is eligible. */
export const PET_ROOM_PLACEMENT_SURFACES: Partial<Record<PetRoomItemKind, readonly PetRoomPlacementSurface[]>> = {
  shelf: [{ id: 'top', localXMin: -0.42, localXMax: 0.42, baselineY: -0.48, usableWidth: 0.84 }],
  side_table: [{ id: 'top', localXMin: -0.41, localXMax: 0.41, baselineY: -0.46, usableWidth: 0.82 }],
  console: [{ id: 'top', localXMin: -0.43, localXMax: 0.43, baselineY: -0.45, usableWidth: 0.86 }],
  dresser: [{ id: 'top', localXMin: -0.42, localXMax: 0.42, baselineY: -0.47, usableWidth: 0.84 }],
  game_table: [{ id: 'top', localXMin: -0.42, localXMax: 0.42, baselineY: -0.12, usableWidth: 0.84 }],
  // Legacy table rows remain valid until the compatibility migration reaches them.
  play_drawing_games: [{ id: 'top', localXMin: -0.42, localXMax: 0.42, baselineY: -0.12, usableWidth: 0.84 }],
};

export function normalizeCutoutPlacementType(value: unknown): PetRoomCutoutPlacementType {
  return PET_ROOM_CUTOUT_PLACEMENT_TYPES.includes(value as PetRoomCutoutPlacementType)
    ? value as PetRoomCutoutPlacementType
    : 'floor';
}

export function placementSurfacesForItem(item: Pick<PetRoomItem, 'catalogItemId'>): readonly PetRoomPlacementSurface[] {
  return PET_ROOM_PLACEMENT_SURFACES[item.catalogItemId] ?? [];
}

export function eligibleSurfaceHosts(items: readonly PetRoomItem[]): PetRoomItem[] {
  return items.filter((item) => item.catalogItemId !== 'cutout' && placementSurfacesForItem(item).length > 0);
}

export type PetRoomPetPlacement = { x: number; y: number };

export const BEDROOM_BED_STYLE_IDS = ['soft', 'cloud', 'woven'] as const;
export type BedroomBedStyleId = typeof BEDROOM_BED_STYLE_IDS[number];
export const DEFAULT_BEDROOM_BED_STYLE_ID: BedroomBedStyleId = 'soft';

export function normalizeBedroomBedStyleId(value: unknown): BedroomBedStyleId {
  return BEDROOM_BED_STYLE_IDS.includes(value as BedroomBedStyleId)
    ? value as BedroomBedStyleId
    : DEFAULT_BEDROOM_BED_STYLE_ID;
}

/** Persisted transform for the functional mailbox visual. Mail data is separate. */
export type RoomMailboxPlacement = { x: number; y: number; scale: number; rotation: number; visible: boolean };
/** Layout-only state for the non-catalog Living World system ornament. */
export type OurBloomPlacement = { x: number; y: number; scale: number; rotation: number; visible: boolean };

export const DEFAULT_ROOM_MAILBOX_PLACEMENT: RoomMailboxPlacement = { x: 0.82, y: 0.82, scale: 1, rotation: 0, visible: true };

export function normalizeRoomMailboxPlacement(value: unknown): RoomMailboxPlacement {
  const candidate = value as Partial<RoomMailboxPlacement> | null;
  const x = Number(candidate?.x);
  const y = Number(candidate?.y);
  return {
    x: Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : DEFAULT_ROOM_MAILBOX_PLACEMENT.x,
    y: Number.isFinite(y) ? Math.max(0, Math.min(1, y)) : DEFAULT_ROOM_MAILBOX_PLACEMENT.y,
    scale: Number.isFinite(Number(candidate?.scale)) ? Math.max(0.55, Math.min(2.2, Number(candidate?.scale))) : 1,
    rotation: Number.isFinite(Number(candidate?.rotation)) ? Math.max(-180, Math.min(180, Number(candidate?.rotation))) : 0,
    visible: candidate?.visible !== false,
  };
}

export function normalizeOurBloomPlacement(value: unknown): OurBloomPlacement {
  const candidate = value as Partial<OurBloomPlacement> | null;
  const x = Number(candidate?.x); const y = Number(candidate?.y); const scale = Number(candidate?.scale); const rotation = Number(candidate?.rotation);
  return { x: Number.isFinite(x) ? Math.max(0.04, Math.min(0.96, x)) : 0.84, y: Number.isFinite(y) ? Math.max(0.12, Math.min(0.9, y)) : 0.8, scale: Number.isFinite(scale) ? Math.max(0.55, Math.min(2.2, scale)) : 1, rotation: Number.isFinite(rotation) ? Math.max(-180, Math.min(180, rotation)) : 0, visible: candidate?.visible !== false };
}

export type CouplePetRoom = {
  id: string;
  coupleId: string;
  /** Stable identity used for persistence, routing, caches, and realtime. */
  spaceKey: RoomSpaceKey;
  /** Stable capability identity; never derive this from the display title. */
  kind?: 'room' | 'game_room' | 'photo_booth' | 'custom';
  sortOrder: number;
  themeId: PetRoomThemeId;
  /** Couple-shared title. Null/blank falls back to localized "Our room". */
  displayName: string | null;
  titleStyle: RoomTitleStyle;
  wallStyleId: PetRoomWallStyleId;
  floorStyleId: PetRoomFloorStyleId;
  visiblePetIds: string[];
  /**
   * Couple-scoped Today featured / lead companion (messenger).
   * Null means clients should apply deterministic fallback (active/oldest).
   */
  todayFeaturedPetId: string | null;
  /**
   * Canonical persistent Today Guide Pet. Optional while old clients/rows are
   * upgraded; clients derive JONGJONG Tiger when it is unset.
   */
  guidePetId?: string | null;
  /**
   * Ordered Today visible companion set.
   * Null / unset → legacy one-pet fallback from the resolved Guide Pet.
   */
  todayVisiblePetIds: string[] | null;
  /** Per-pet floor positions. Missing ids fall back to default home slots. */
  petPlacements: Record<string, PetRoomPetPlacement>;
  /** Bedroom-only positions. Main room placement remains independently persisted. */
  bedroomPetPlacements: Record<string, PetRoomPetPlacement>;
  /** Persisted Bedroom emotional state, keyed independently per pet. */
  bedroomRestingPetIds: string[];
  /** Couple-shared visual skin for the designed Bedroom bed. */
  bedroomBedStyleId?: BedroomBedStyleId;
  /** Couple-shared position of the functional Room mailbox fixture. */
  mailboxPlacement: RoomMailboxPlacement;
  /** Reserved system-item transform; it is never included in the user catalog. */
  ourBloomPlacement: OurBloomPlacement;
  /** Couple-chosen artwork for the mailbox fixture. Null keeps the built-in mailbox. */
  mailboxSkin?: PetRoomObjectSkin | null;
  items: PetRoomItem[];
  createdAt: string;
  updatedAt: string;
};

export const V1_ROOM_SPACE_KEYS = ['our_room', 'game_room'] as const;
export type RoomSpaceKey = typeof V1_ROOM_SPACE_KEYS[number] | (string & {});

/** Canonical spaces that cannot be deleted — only custom-created rooms can. */
export const PROTECTED_ROOM_SPACE_KEYS = ['our_room', 'game_room', 'photo_booth_room'] as const;

export function isDeletableRoomSpace(spaceKey: string | null | undefined): boolean {
  if (!spaceKey) return false;
  return !(PROTECTED_ROOM_SPACE_KEYS as readonly string[]).includes(spaceKey);
}

export type CoupleRoomSpaceSummary = {
  id: string;
  coupleId: string;
  spaceKey: RoomSpaceKey;
  displayName: string | null;
  sortOrder: number;
};

export type PetRoomHomeSlot = { x: number; y: number; scale: number; zIndex: number };

export const FRAME_SIZE_SCALE: Record<PetRoomFrameSize, number> = {
  small: 0.82,
  medium: 1,
  large: 1.28,
};

export const FRAME_BASE_SIZE: Record<'photo_frame' | 'photo_strip_frame', { width: number; height: number }> = {
  photo_frame: { width: 74, height: 62 },
  photo_strip_frame: { width: 48, height: 88 },
};

/** Freeform frames stay fully recoverable inside the usable wall. */
export const FRAME_MIN_TOUCH_SIZE_PX = 44;
export const FRAME_MIN_WALL_FRACTION = 0.08;
export const FRAME_MAX_WALL_FRACTION = 0.90;
export type FrameResizeHandle = 'left' | 'right' | 'top' | 'bottom' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

/** True when the room has user-placed canvas content (pets/mailbox are system chrome). */
export function roomHasMeaningfulContent(items: readonly Pick<PetRoomItem, 'catalogItemId'>[] | null | undefined): boolean {
  return Array.isArray(items) && items.length > 0;
}

/** Empty newly-created rooms may show one decorate CTA; populated rooms must not. */
export function roomShowsEmptyDecorateCta(items: readonly Pick<PetRoomItem, 'catalogItemId'>[] | null | undefined): boolean {
  return !roomHasMeaningfulContent(items);
}

export function isPhotoFrameItem(item: Pick<PetRoomItem, 'catalogItemId'>): boolean {
  return item.catalogItemId === 'photo_frame' || item.catalogItemId === 'photo_strip_frame';
}

export function isRoomTextItem(item: Pick<PetRoomItem, 'catalogItemId'>): boolean {
  return item.catalogItemId === 'text';
}

export function normalizeRoomDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Array.from(trimmed).slice(0, ROOM_DISPLAY_NAME_MAX_LENGTH).join('');
}

export function roomDisplayTitle(displayName: string | null | undefined, fallback: string): string {
  return displayName?.trim() ? displayName : fallback;
}

function includesValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return values.includes(value as T);
}

export function normalizeRoomTextColor(value: unknown, fallback: string): string {
  if (includesValue(PET_ROOM_TEXT_COLOR_IDS, value)) return PET_ROOM_TEXT_COLORS[value];
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    return `#${cleaned.split('').map((part) => part + part).join('').toUpperCase()}`;
  }
  return /^[0-9a-f]{6}$/i.test(cleaned) ? `#${cleaned.toUpperCase()}` : fallback;
}

export function normalizeRoomTitleStyle(value: unknown): RoomTitleStyle {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const numericSize = Number(raw.fontSize);
  return {
    preset: includesValue(ROOM_TITLE_STYLE_PRESETS, raw.preset) ? raw.preset : DEFAULT_ROOM_TITLE_STYLE.preset,
    fontSize: Number.isFinite(numericSize)
      ? Math.max(ROOM_TITLE_FONT_SIZE_MIN, Math.min(ROOM_TITLE_FONT_SIZE_MAX, numericSize))
      : DEFAULT_ROOM_TITLE_STYLE.fontSize,
    color: includesValue(ROOM_TITLE_COLOR_IDS, raw.color) ? raw.color : DEFAULT_ROOM_TITLE_STYLE.color,
    visible: typeof raw.visible === 'boolean' ? raw.visible : DEFAULT_ROOM_TITLE_STYLE.visible,
  };
}

export function normalizeRoomTextObject(value: unknown, fallbackPreset: PetRoomTextPreset = 'plain'): PetRoomTextObject | null {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  const body = typeof raw?.body === 'string' ? raw.body : '';
  if (!body.trim() && !raw) return null;
  const preset = includesValue(PET_ROOM_TEXT_PRESETS, raw?.preset) ? raw.preset : fallbackPreset;
  const fontPreset = includesValue(PET_ROOM_TEXT_FONT_PRESETS, raw?.fontPreset) ? raw.fontPreset : 'soft';
  const requestedFontSize = Number(raw?.fontSize);
  const fontSize = Number.isFinite(requestedFontSize)
    ? Math.max(ROOM_TEXT_FONT_SIZE_MIN, Math.min(ROOM_TEXT_FONT_SIZE_MAX, requestedFontSize))
    : resolveRoomTextFontSize(fontPreset);
  const fallbackColor = PET_ROOM_TEXT_COLORS[preset === 'plain' ? 'cocoa' : 'charcoal'];
  const color = normalizeRoomTextColor(raw?.color, fallbackColor);
  const backgroundColor = raw && Object.prototype.hasOwnProperty.call(raw, 'backgroundColor') && raw.backgroundColor != null
    ? normalizeRoomTextColor(raw.backgroundColor, '#FFFFFF')
    : null;
  const align = includesValue(PET_ROOM_TEXT_ALIGNS, raw?.align) ? raw.align : 'center';
  const surfacePreset = preset === 'sign'
    ? (includesValue(PET_ROOM_SIGN_SURFACE_IDS, raw?.surfacePreset) ? raw.surfacePreset : 'wood')
    : preset === 'note'
      ? (includesValue(PET_ROOM_NOTE_SURFACE_IDS, raw?.surfacePreset) ? raw.surfacePreset : 'cream')
      : undefined;
  return { body, preset, fontPreset, fontSize, color, backgroundColor, align, surfacePreset };
}

export function defaultRoomTextObject(preset: PetRoomTextPreset, body = ''): PetRoomTextObject {
  return normalizeRoomTextObject({
    body,
    preset,
    fontPreset: preset === 'note' ? 'handwritten' : preset === 'sign' ? 'bold' : 'soft',
    color: preset === 'plain' ? 'cocoa' : 'charcoal',
    align: 'center',
    surfacePreset: preset === 'sign' ? 'wood' : preset === 'note' ? 'cream' : undefined,
  }, preset) ?? {
    body, preset, fontPreset: 'soft', fontSize: 15, color: PET_ROOM_TEXT_COLORS.cocoa, backgroundColor: null, align: 'center',
  };
}

export function createRoomTextItem(input: {
  roomId: string;
  id: string;
  preset: PetRoomTextPreset;
  body: string;
  existingTextCount?: number;
  now?: string;
}): PetRoomItem {
  const catalog = PET_ROOM_CATALOG.text;
  const now = input.now ?? new Date().toISOString();
  const offset = input.existingTextCount ?? 0;
  return {
    id: input.id,
    roomId: input.roomId,
    catalogItemId: 'text',
    x: catalog.defaultX + (offset % 3) * 0.06,
    y: catalog.defaultY + Math.floor(offset / 3) * 0.05,
    scale: catalog.defaultScale,
    rotation: 0,
    flipX: false,
    zIndex: catalog.zIndex,
    photo: null,
    cutout: null,
    textObject: defaultRoomTextObject(input.preset, input.body),
    frameSize: null,
    frameStyle: null,
    normalizedWidth: null,
    normalizedHeight: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeRoomItemFlipX(
  catalogItemId: PetRoomItemKind,
  value: unknown,
): boolean {
  return catalogItemId === 'cutout' && value === true;
}

export function toggleRoomCutoutFlip(item: PetRoomItem): PetRoomItem {
  return item.catalogItemId === 'cutout' ? { ...item, flipX: !item.flipX } : item;
}

export function usableWallSize(room: RoomSize): RoomSize {
  return {
    width: Math.max(1, room.width * (PET_WALL_BOUNDS.maxX - PET_WALL_BOUNDS.minX)),
    height: Math.max(1, room.height * (PET_WALL_BOUNDS.maxY - PET_WALL_BOUNDS.minY)),
  };
}

export function frameDimensionLimits(room: RoomSize) {
  const wall = usableWallSize(room);
  return {
    minWidth: Math.min(FRAME_MAX_WALL_FRACTION, Math.max(FRAME_MIN_WALL_FRACTION, FRAME_MIN_TOUCH_SIZE_PX / wall.width)),
    minHeight: Math.min(FRAME_MAX_WALL_FRACTION, Math.max(FRAME_MIN_WALL_FRACTION, FRAME_MIN_TOUCH_SIZE_PX / wall.height)),
    maxWidth: FRAME_MAX_WALL_FRACTION,
    maxHeight: FRAME_MAX_WALL_FRACTION,
  };
}

export function defaultFrameNormalizedDimensions(kind: PetRoomItemKind = 'photo_frame') {
  return kind === 'photo_strip_frame'
    ? { normalizedWidth: 0.123, normalizedHeight: 0.228 }
    : { normalizedWidth: 0.19, normalizedHeight: 0.155 };
}

export function normalizeFrameSize(value: unknown): PetRoomFrameSize {
  return PET_ROOM_FRAME_SIZES.includes(value as PetRoomFrameSize) ? (value as PetRoomFrameSize) : 'medium';
}

export function normalizeFrameStyle(value: unknown): PetRoomFrameStyle {
  return PET_ROOM_FRAME_STYLES.includes(value as PetRoomFrameStyle) ? (value as PetRoomFrameStyle) : 'classic';
}

export function resolveFrameRenderSize(
  item: Pick<PetRoomItem, 'catalogItemId' | 'frameSize' | 'frameStyle' | 'scale' | 'normalizedWidth' | 'normalizedHeight'>,
  room?: RoomSize,
) {
  // Square is a presentation, not merely a crop inside the classic frame.
  // `frameStyle` is optional here so existing callers retain their old sizing.
  const isSquare = item.frameStyle === 'square';
  const kind = item.catalogItemId === 'photo_strip_frame' ? 'photo_strip_frame' : 'photo_frame';
  const base = FRAME_BASE_SIZE[kind];
  const size = normalizeFrameSize(item.frameSize);
  const factor = FRAME_SIZE_SCALE[size] * (item.scale || 1);
  const width = Math.round(base.width * factor);
  const legacyHeight = isSquare ? width : Math.round(base.height * factor);
  if (!room || !Number.isFinite(item.normalizedWidth) || !Number.isFinite(item.normalizedHeight)) {
    return { width, height: legacyHeight, size };
  }
  const wall = usableWallSize(room);
  const limits = frameDimensionLimits(room);
  const normalizedWidth = Math.max(limits.minWidth, Math.min(limits.maxWidth, Number(item.normalizedWidth)));
  const normalizedHeight = Math.max(limits.minHeight, Math.min(limits.maxHeight, Number(item.normalizedHeight)));
  return {
    width: normalizedWidth * wall.width,
    height: normalizedHeight * wall.height,
    normalizedWidth,
    normalizedHeight,
    size,
  };
}

export function resolvePetRoomHomeSlots(input: { roomWidth: number; roomHeight: number; petCount: number }): PetRoomHomeSlot[] {
  const count = Math.max(0, Math.min(3, Math.floor(input.petCount)));
  if (count === 0) return [];
  if (count === 1) return [{ x: 0.5, y: 0.69, scale: 1, zIndex: 52 }];
  if (count === 2) return [
    { x: 0.37, y: 0.69, scale: 0.97, zIndex: 52 },
    { x: 0.63, y: 0.69, scale: 0.97, zIndex: 53 },
  ];
  return [
    { x: 0.32, y: 0.70, scale: 0.91, zIndex: 53 },
    { x: 0.68, y: 0.70, scale: 0.91, zIndex: 54 },
    { x: 0.50, y: 0.60, scale: 0.88, zIndex: 49 },
  ];
}

export const PET_FLOOR_BOUNDS = {
  /** @deprecated Pets still use these foot bounds. Ordinary Room objects use PET_CANVAS_BOUNDS. */
  minX: 0,
  maxX: 1,
  /** Just below the wall/floor seam through the bottom edge. */
  minY: 0.46,
  maxY: 1,
} as const;

export const PET_WALL_BOUNDS = {
  /** @deprecated Appearance seam + legacy frame size units. Not an object-placement plane. */
  minX: 0,
  maxX: 1,
  minY: 0,
  maxY: 0.50,
} as const;

/**
 * Universal Canvas recovery bounds for ordinary user-placeable Room objects.
 * Wall / Floor / Surface are NOT placement constraints — only recoverability matters.
 */
export const PET_CANVAS_BOUNDS = {
  minX: 0,
  maxX: 1,
  minY: 0,
  maxY: 1,
} as const;

/** @deprecated Wall Cutout HUD inset — unused by Universal Canvas free placement. */
export const PET_WALL_CUTOUT_SAFE_TOP = 0.12;

/**
 * Canonical logical floor contract for persistence (RPC + DB).
 * Covers client visual-bounds slack; does NOT encode pixel/half-width math.
 * Keep in sync with set_couple_pet_room_pet_placements migration.
 */
export const SERVER_PET_FLOOR_BOUNDS = {
  minX: -0.20,
  maxX: 1.20,
  minY: 0.35,
  maxY: 1.15,
} as const;

/** Majority of the object must stay inside the semantic region. */
export const ROOM_VISIBLE_KEEP = 0.55;

export type RoomSize = { width: number; height: number };

const DEFAULT_ROOM_SIZE: RoomSize = { width: 390, height: 420 };

/** Approximate on-screen furniture size for visual-bounds clamping. */
export function resolveItemVisualSizePx(
  item: Pick<PetRoomItem, 'catalogItemId' | 'frameSize' | 'frameStyle' | 'scale' | 'normalizedWidth' | 'normalizedHeight' | 'cutout' | 'textObject'> & Partial<Pick<PetRoomItem, 'zIndex' | 'isLocked'>>,
  room: RoomSize = DEFAULT_ROOM_SIZE,
): { width: number; height: number } {
  const scale = item.scale || 1;
  if (item.catalogItemId === 'text') {
    return resolveRoomTextVisualSizePx(item.textObject, scale);
  }
  if (item.catalogItemId === 'photo_frame' || item.catalogItemId === 'photo_strip_frame') {
    const frame = resolveFrameRenderSize(item, room);
    return { width: frame.width, height: frame.height };
  }
  if (item.catalogItemId === 'cutout' && item.cutout) {
    const aspect = Math.max(0.08, Math.min(12, item.cutout.width / Math.max(1, item.cutout.height)));
    let height = 150 * scale;
    let width = height * aspect;
    const maxWidth = 190 * scale;
    if (width > maxWidth) {
      height *= maxWidth / width;
      width = maxWidth;
    }
    return { width, height };
  }
  if (item.catalogItemId === 'wall_art') return { width: 78 * scale, height: 64 * scale };
  if (item.catalogItemId === 'wall_poster') return { width: 72 * scale, height: 92 * scale };
  if (item.catalogItemId === 'string_lights') return { width: 176 * scale, height: 44 * scale };
  if (item.catalogItemId === 'plant') return { width: 40 * scale, height: 56 * scale };
  if (item.catalogItemId === 'small_plant') return { width: 34 * scale, height: 42 * scale };
  if (item.catalogItemId === 'shelf') return { width: 132 * scale, height: 74 * scale };
  if (item.catalogItemId === 'side_table') return { width: 104 * scale, height: 76 * scale };
  if (item.catalogItemId === 'sofa') return { width: 184 * scale, height: 92 * scale };
  if (item.catalogItemId === 'console') return { width: 142 * scale, height: 74 * scale };
  if (item.catalogItemId === 'dresser') return { width: 126 * scale, height: 88 * scale };
  if (item.catalogItemId === 'floor_lamp') return { width: 58 * scale, height: 128 * scale };
  if (item.catalogItemId === 'cushion') return { width: 52 * scale, height: 42 * scale };
  if (item.catalogItemId === 'accent_rug') {
    if (isBuiltInCenterRug(item)) return { width: Math.round(room.width * 0.46) * scale + 14, height: 64 * scale };
    return { width: 172 * scale, height: 64 * scale };
  }
  if (item.catalogItemId === 'table_lamp') return { width: 46 * scale, height: 58 * scale };
  if (item.catalogItemId === 'vase') return { width: 36 * scale, height: 52 * scale };
  if (item.catalogItemId === 'plush') return { width: 52 * scale, height: 62 * scale };
  if (item.catalogItemId === 'keepsake') return { width: 42 * scale, height: 38 * scale };
  if (item.catalogItemId === 'play_kuji') return { width: 92 * scale, height: 102 * scale };
  // Play props keep their own silhouettes: a fanned card pair is wide, a jar is
  // tall, an envelope and a note bundle sit small. Deltas stay small so stored
  // placements keep roughly the footprint their owners arranged.
  if (item.catalogItemId === 'play_truth_dare') return { width: 62 * scale, height: 50 * scale };
  if (item.catalogItemId === 'play_question_jar') return { width: 58 * scale, height: 64 * scale };
  if (item.catalogItemId === 'play_roulette') return { width: 82 * scale, height: 82 * scale };
  if (item.catalogItemId === 'play_balance_game') return { width: 92 * scale, height: 66 * scale };
  if (item.catalogItemId === 'play_secret_mission') return { width: 54 * scale, height: 46 * scale };
  if (item.catalogItemId === 'for_you_bundle') return { width: 52 * scale, height: 44 * scale };
  // The Game Table footprint matches its quiet, wide tabletop. Surface hosts
  // are deliberately independent visual children.
  if (item.catalogItemId === 'game_table' || item.catalogItemId === 'play_drawing_games') return { width: 132 * scale, height: 46 * scale };
  if (item.catalogItemId === 'play_drawing_set') return { width: 82 * scale, height: 58 * scale };
  if (item.catalogItemId === 'bed') return { width: 188 * scale, height: 70 * scale };
  if (item.catalogItemId === 'bowl') return { width: 64 * scale, height: 52 * scale };
  if (item.catalogItemId === 'toy') return { width: 32 * scale, height: 32 * scale };
  return { width: 56 * scale, height: 56 * scale };
}

export function resolveRoomTextFontSize(fontPreset: PetRoomTextFontPreset | PetRoomTextObject): number {
  if (typeof fontPreset === 'object') return fontPreset.fontSize;
  if (fontPreset === 'tiny') return 12;
  if (fontPreset === 'bold') return 18;
  if (fontPreset === 'handwritten') return 16;
  return 15;
}

export function resolveRoomTextVisualSizePx(textObject: PetRoomTextObject | null | undefined, scale = 1): { width: number; height: number } {
  const preset = textObject?.preset ?? 'plain';
  const fontSize = textObject ? resolveRoomTextFontSize(textObject) : resolveRoomTextFontSize('soft');
  const lines = (textObject?.body || ' ').split('\n');
  const longest = Math.max(1, ...lines.map((line) => Math.max(1, Array.from(line).length)));
  const contentWidth = Math.min(220, Math.max(52, longest * fontSize * 0.62));
  const contentHeight = Math.max(fontSize + 10, lines.length * (fontSize + 6));
  if (preset === 'sign') return { width: (contentWidth + 28) * scale, height: (contentHeight + 34) * scale };
  if (preset === 'note') {
    const edge = Math.max(92, contentWidth + 22, contentHeight + 28);
    return { width: edge * scale, height: edge * scale };
  }
  const backgroundPadding = textObject?.backgroundColor ? { width: 16, height: 8 } : { width: 0, height: 0 };
  return { width: (contentWidth + backgroundPadding.width) * scale, height: (contentHeight + backgroundPadding.height) * scale };
}

export function resolveItemVisualHalfNorm(
  item: Pick<PetRoomItem, 'catalogItemId' | 'frameSize' | 'frameStyle' | 'scale' | 'normalizedWidth' | 'normalizedHeight' | 'cutout' | 'textObject'>,
  room: RoomSize = DEFAULT_ROOM_SIZE,
): { halfW: number; halfH: number } {
  const size = resolveItemVisualSizePx(item, room);
  return {
    halfW: (size.width / 2) / Math.max(1, room.width),
    halfH: (size.height / 2) / Math.max(1, room.height),
  };
}

/**
 * Clamp a center point so most of the object's visual extent stays inside a region.
 * Slight edge overlap is allowed — no large arbitrary safety margins.
 */
export function clampCenterToRegion(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  region: { minX: number; maxX: number; minY: number; maxY: number },
  keepVisible = ROOM_VISIBLE_KEEP,
): { x: number; y: number } {
  const slackX = Math.max(0, halfW) * (1 - keepVisible);
  const slackY = Math.max(0, halfH) * (1 - keepVisible);
  return {
    x: Math.max(region.minX - slackX, Math.min(region.maxX + slackX, x)),
    y: Math.max(region.minY - slackY, Math.min(region.maxY + slackY, y)),
  };
}

export function clampPetPlacement(
  placement: PetRoomPetPlacement,
  options?: { halfWidthNorm?: number; halfHeightNorm?: number },
): PetRoomPetPlacement {
  const halfW = Math.max(0.02, Math.min(0.35, options?.halfWidthNorm ?? 0.12));
  const halfH = Math.max(0.02, Math.min(0.25, options?.halfHeightNorm ?? 0.08));
  return clampCenterToRegion(placement.x, placement.y, halfW, halfH, PET_FLOOR_BOUNDS);
}

export function resolvePetFootFloorBounds(input: {
  roomHeight: number;
  groundFromBottom: number;
}): { minY: number; maxY: number } {
  const roomHeight = Math.max(1, input.roomHeight);
  const groundFromBottom = Math.max(0, Math.min(roomHeight, input.groundFromBottom));
  return {
    // Placement y is the rendered foot/baseline anchor, not the bitmap center.
    minY: (roomHeight - groundFromBottom) / roomHeight,
    maxY: 1,
  };
}

export function resolveVisiblePetFootMaxY(input: {
  roomHeight: number;
  overlayTop: number;
  requiredClearance: number;
}): number {
  const roomHeight = Math.max(1, input.roomHeight);
  const overlayTop = Math.max(0, Math.min(roomHeight, input.overlayTop));
  const requiredClearance = Math.max(0, input.requiredClearance);
  return Math.max(0, Math.min(1, (overlayTop - requiredClearance) / roomHeight));
}

/**
 * Pet-specific room clamp: horizontal bounds retain visual-width slack, while
 * the vertical coordinate is an exact foot anchor constrained to the floor.
 */
export function clampPetFootPlacement(
  placement: PetRoomPetPlacement,
  options: { halfWidthNorm?: number; roomHeight: number; groundFromBottom: number; maxFootY?: number },
): PetRoomPetPlacement {
  const halfW = Math.max(0.02, Math.min(0.35, options.halfWidthNorm ?? 0.12));
  const floor = resolvePetFootFloorBounds(options);
  const maxY = Math.max(floor.minY, Math.min(floor.maxY, options.maxFootY ?? floor.maxY));
  const horizontal = clampCenterToRegion(placement.x, floor.minY, halfW, 0, {
    minX: PET_FLOOR_BOUNDS.minX,
    maxX: PET_FLOOR_BOUNDS.maxX,
    minY: floor.minY,
    maxY,
  });
  return {
    x: horizontal.x,
    y: Math.max(floor.minY, Math.min(maxY, placement.y)),
  };
}

export function normalizePetPlacementsToFootFloor(
  placements: Record<string, PetRoomPetPlacement>,
  options: { roomHeight: number; groundFromBottom: number },
): Record<string, PetRoomPetPlacement> {
  const floor = resolvePetFootFloorBounds(options);
  const normalized: Record<string, PetRoomPetPlacement> = {};
  for (const [petId, placement] of Object.entries(placements)) {
    if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) continue;
    normalized[petId] = {
      x: placement.x,
      y: Math.max(floor.minY, Math.min(floor.maxY, placement.y)),
    };
  }
  return normalized;
}

/** True when finite coords sit inside the server logical floor contract. */
export function isServerLegalPetPlacement(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return (
    x >= SERVER_PET_FLOOR_BOUNDS.minX
    && x <= SERVER_PET_FLOOR_BOUNDS.maxX
    && y >= SERVER_PET_FLOOR_BOUNDS.minY
    && y <= SERVER_PET_FLOOR_BOUNDS.maxY
  );
}

/**
 * Preflight before RPC: clamp into the canonical server floor range.
 * Does not re-apply visual half-width margins (device-specific).
 * Drops non-finite placements instead of failing the whole save.
 */
export function normalizePetPlacementForPersist(
  placement: PetRoomPetPlacement,
): PetRoomPetPlacement | null {
  const x = Number(placement.x);
  const y = Number(placement.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.max(SERVER_PET_FLOOR_BOUNDS.minX, Math.min(SERVER_PET_FLOOR_BOUNDS.maxX, x)),
    y: Math.max(SERVER_PET_FLOOR_BOUNDS.minY, Math.min(SERVER_PET_FLOOR_BOUNDS.maxY, y)),
  };
}

export function normalizePetPlacementsForPersist(
  placements: Record<string, PetRoomPetPlacement>,
): Record<string, PetRoomPetPlacement> {
  const next: Record<string, PetRoomPetPlacement> = {};
  for (const [petId, placement] of Object.entries(placements)) {
    const normalized = normalizePetPlacementForPersist(placement);
    if (normalized) next[petId] = normalized;
  }
  return next;
}

export function resolvePetPlacement(input: {
  petId: string;
  index: number;
  petCount: number;
  placements: Record<string, PetRoomPetPlacement>;
  roomWidth: number;
  roomHeight: number;
  petWidth?: number;
  groundFromBottom?: number;
  maxFootY?: number;
}): PetRoomHomeSlot {
  const slots = resolvePetRoomHomeSlots({
    roomWidth: input.roomWidth,
    roomHeight: input.roomHeight,
    petCount: input.petCount,
  });
  const fallback = slots[input.index] ?? slots[0] ?? { x: 0.5, y: 0.69, scale: 1, zIndex: 52 };
  const saved = input.placements[input.petId];
  if (!saved && input.groundFromBottom == null) return fallback;
  const halfW = (input.petWidth ?? input.roomWidth * 0.28) / 2 / Math.max(1, input.roomWidth);
  const clamped = input.groundFromBottom == null
    ? clampPetPlacement(saved ?? fallback, { halfWidthNorm: halfW, halfHeightNorm: halfW * 0.55 })
    : clampPetFootPlacement(saved ?? fallback, {
        halfWidthNorm: halfW,
        roomHeight: input.roomHeight,
        groundFromBottom: input.groundFromBottom,
        maxFootY: input.maxFootY,
      });
  // Farther-up (smaller y) renders behind; lower pets render in front.
  const depthZ = 48 + Math.round(clamped.y * 40);
  return { ...fallback, x: clamped.x, y: clamped.y, zIndex: depthZ };
}

export function clampRoomItemPlacement(
  item: Pick<PetRoomItem, 'catalogItemId' | 'x' | 'y' | 'scale' | 'rotation' | 'flipX' | 'zIndex' | 'frameSize' | 'frameStyle' | 'normalizedWidth' | 'normalizedHeight' | 'cutout' | 'textObject' | 'placementType' | 'surfaceHostItemId' | 'surfaceId' | 'surfaceLocalX'>,
  room: RoomSize = DEFAULT_ROOM_SIZE,
) {
  const catalog = PET_ROOM_CATALOG[item.catalogItemId];
  const region = PET_CANVAS_BOUNDS;
  const scale = Math.max(catalog.minScale, Math.min(catalog.maxScale, Number.isFinite(item.scale) ? item.scale : catalog.defaultScale));
  const half = resolveItemVisualHalfNorm({ ...item, scale }, room);
  const hasFreeformFrame = isPhotoFrameItem(item)
    && Number.isFinite(item.normalizedWidth)
    && Number.isFinite(item.normalizedHeight);
  const safeX = Number.isFinite(item.x) ? item.x : catalog.defaultX;
  const safeY = Number.isFinite(item.y) ? item.y : catalog.defaultY;
  // Universal Canvas: every ordinary object may occupy the full Room.
  // Cutouts keep foot-anchor x/y semantics for rendering, but no Floor/Wall plane.
  const center = item.catalogItemId === 'cutout'
    ? {
        x: Math.max(region.minX, Math.min(region.maxX, safeX)),
        y: Math.max(region.minY, Math.min(region.maxY, safeY)),
      }
    : hasFreeformFrame
    ? {
        x: Math.max(region.minX + half.halfW * 0.2, Math.min(region.maxX - half.halfW * 0.2, safeX)),
        y: Math.max(region.minY + half.halfH * 0.2, Math.min(region.maxY - half.halfH * 0.2, safeY)),
      }
    : clampCenterToRegion(safeX, safeY, half.halfW, half.halfH, region, 0.45);
  return {
    ...item,
    x: center.x,
    y: center.y,
    scale,
    rotation: catalog.rotatable
      ? normalizeRotationDegrees(Number.isFinite(item.rotation) ? item.rotation : 0)
      : 0,
    // zIndex is the composition SSOT — do not rewrite from Y / placement plane.
    // Soft floor mats are clamped under the pet band so bring-to-front cannot hide pets.
    zIndex: clampRoomItemZIndex(
      item.catalogItemId,
      Number.isFinite(item.zIndex) ? item.zIndex : catalog.zIndex,
    ),
  };
}

/**
 * Fixed foreground controls occupy a small, known safe-area exclusion zone in
 * the Room viewport. Functional objects are gently nudged out of that zone
 * when released from the editor; decorative objects retain full freeform
 * placement. The rule is expressed in normalized Room coordinates so it
 * remains independent of device pixels and saved object coordinates.
 */
export function clampInteractiveRoomItemPlacement(
  item: Parameters<typeof clampRoomItemPlacement>[0],
  room: RoomSize = DEFAULT_ROOM_SIZE,
) {
  const clamped = clampRoomItemPlacement(item, room);
  const catalog = PET_ROOM_CATALOG[item.catalogItemId];
  if (!catalog.functional) return clamped;
  const half = resolveItemVisualHalfNorm(clamped, room);
  const overlapsMemoriesControl = clamped.x - half.halfW < 0.40 && clamped.y + half.halfH > 0.78;
  if (!overlapsMemoriesControl) return clamped;
  const safeX = Math.min(PET_CANVAS_BOUNDS.maxX - half.halfW, 0.62);
  return { ...clamped, x: Math.max(PET_CANVAS_BOUNDS.minX + half.halfW, safeX) };
}

export type ResolvedPlacementSurface = PetRoomPlacementSurface & {
  host: PetRoomItem;
  centerX: number;
  centerY: number;
  width: number;
  angle: number;
};

export type ResolvedPlacementSurfaceTarget = {
  host: PetRoomItem;
  surface: ResolvedPlacementSurface;
  hitHeight: number;
};

export function resolvePlacementSurface(
  host: PetRoomItem,
  surfaceId: string,
  room: RoomSize = DEFAULT_ROOM_SIZE,
): ResolvedPlacementSurface | null {
  const surface = placementSurfacesForItem(host).find((candidate) => candidate.id === surfaceId);
  if (!surface) return null;
  const hostSize = resolveItemVisualSizePx(host, room);
  const angle = host.rotation * Math.PI / 180;
  const vertical = surface.baselineY * hostSize.height;
  return {
    ...surface,
    host,
    centerX: host.x * room.width - Math.sin(angle) * vertical,
    centerY: host.y * room.height + Math.cos(angle) * vertical,
    width: hostSize.width,
    angle,
  };
}

/** Stable transformed targets, ordered back-to-front for predictable rendering. */
export function resolvePlacementSurfaceTargets(
  items: readonly PetRoomItem[],
  room: RoomSize = DEFAULT_ROOM_SIZE,
): ResolvedPlacementSurfaceTarget[] {
  return eligibleSurfaceHosts(items).flatMap((host) => placementSurfacesForItem(host).flatMap((definition) => {
    const surface = resolvePlacementSurface(host, definition.id, room);
    if (!surface) return [];
    return [{
      host,
      surface,
      hitHeight: Math.max(34, resolveItemVisualSizePx(host, room).height * 0.38),
    }];
  })).sort((a, b) => (
    a.host.zIndex - b.host.zIndex
    || a.host.id.localeCompare(b.host.id)
    || a.surface.id.localeCompare(b.surface.id)
  ));
}

/** Resolve overlaps by room depth, then nearest surface plane, then stable ids. */
export function resolvePlacementSurfaceTargetAtPoint(
  items: readonly PetRoomItem[],
  point: { x: number; y: number },
  room: RoomSize = DEFAULT_ROOM_SIZE,
): ResolvedPlacementSurfaceTarget | null {
  const candidates = resolvePlacementSurfaceTargets(items, room).filter(({ surface, hitHeight }) => {
    const dx = point.x - surface.centerX;
    const dy = point.y - surface.centerY;
    const localX = Math.cos(surface.angle) * dx + Math.sin(surface.angle) * dy;
    const localY = -Math.sin(surface.angle) * dx + Math.cos(surface.angle) * dy;
    return Math.abs(localX) <= surface.width * surface.usableWidth / 2
      && Math.abs(localY) <= hitHeight / 2;
  });
  candidates.sort((a, b) => {
    if (a.host.zIndex !== b.host.zIndex) return b.host.zIndex - a.host.zIndex;
    const aDistance = Math.abs(-Math.sin(a.surface.angle) * (point.x - a.surface.centerX)
      + Math.cos(a.surface.angle) * (point.y - a.surface.centerY));
    const bDistance = Math.abs(-Math.sin(b.surface.angle) * (point.x - b.surface.centerX)
      + Math.cos(b.surface.angle) * (point.y - b.surface.centerY));
    return aDistance - bDistance
      || a.host.id.localeCompare(b.host.id)
      || a.surface.id.localeCompare(b.surface.id);
  });
  return candidates[0] ?? null;
}

export function resolveSurfaceCutoutAttachment(
  item: PetRoomItem,
  items: readonly PetRoomItem[],
  room: RoomSize = DEFAULT_ROOM_SIZE,
): { x: number; y: number; rotation: number; zIndex: number } | null {
  if (item.catalogItemId !== 'cutout' || normalizeCutoutPlacementType(item.placementType) !== 'surface') return null;
  const host = items.find((candidate) => candidate.id === item.surfaceHostItemId);
  if (!host || !item.surfaceId) return null;
  const surface = resolvePlacementSurface(host, item.surfaceId, room);
  if (!surface) return null;
  const localX = Math.max(surface.localXMin, Math.min(surface.localXMax, Number(item.surfaceLocalX ?? 0)));
  const offset = localX * surface.width;
  return {
    x: (surface.centerX + Math.cos(surface.angle) * offset) / room.width,
    y: (surface.centerY + Math.sin(surface.angle) * offset) / room.height,
    rotation: item.rotation + host.rotation,
    zIndex: Math.min(89, Math.max(host.zIndex + 1, item.zIndex)),
  };
}

/**
 * Legacy Surface resolver retained for one-shot bake / migration.
 * Universal Canvas runtime treats free x/y as authoritative; after bake,
 * Surface metadata is cleared and this becomes an identity.
 */
export function resolveCutoutRoomPlacement(
  item: PetRoomItem,
  items: readonly PetRoomItem[],
  room: RoomSize = DEFAULT_ROOM_SIZE,
): PetRoomItem {
  const attached = resolveSurfaceCutoutAttachment(item, items, room);
  if (attached) {
    return {
      ...item,
      x: attached.x,
      y: attached.y,
      rotation: attached.rotation,
      zIndex: attached.zIndex,
    };
  }
  return item.catalogItemId === 'cutout' && normalizeCutoutPlacementType(item.placementType) === 'surface'
    ? clampSurfaceCutout(item, items, room)
    : item;
}

export function capCutoutScaleForSurface(
  item: PetRoomItem,
  host: PetRoomItem,
  surfaceId: string,
  room: RoomSize = DEFAULT_ROOM_SIZE,
): number {
  const surface = resolvePlacementSurface(host, surfaceId, room);
  if (!surface) return item.scale;
  const atUnit = resolveItemVisualSizePx({ ...item, scale: 1 }, room);
  const widthCap = surface.width * surface.usableWidth * 0.58;
  const heightCap = surface.width * surface.usableWidth * 0.72;
  return Math.max(PET_ROOM_CATALOG.cutout.minScale, Math.min(
    item.scale,
    PET_ROOM_CATALOG.cutout.maxScale,
    widthCap / Math.max(1, atUnit.width),
    heightCap / Math.max(1, atUnit.height),
  ));
}

export function clampSurfaceCutout(
  item: PetRoomItem,
  items: readonly PetRoomItem[],
  room: RoomSize = DEFAULT_ROOM_SIZE,
): PetRoomItem {
  const host = items.find((candidate) => candidate.id === item.surfaceHostItemId);
  const surface = host && item.surfaceId ? resolvePlacementSurface(host, item.surfaceId, room) : null;
  if (!host || !surface) {
    return clampRoomItemPlacement({
      ...item,
      placementType: 'floor',
      surfaceHostItemId: null,
      surfaceId: null,
      surfaceLocalX: null,
    }, room) as PetRoomItem;
  }
  const scale = capCutoutScaleForSurface(item, host, surface.id, room);
  const childSize = resolveItemVisualSizePx({ ...item, scale }, room);
  const halfChildLocal = childSize.width / Math.max(1, surface.width) / 2;
  const min = Math.min(surface.localXMax, surface.localXMin + halfChildLocal);
  const max = Math.max(min, surface.localXMax - halfChildLocal);
  const surfaceLocalX = Math.max(min, Math.min(max, Number(item.surfaceLocalX ?? 0)));
  const attached = resolveSurfaceCutoutAttachment({ ...item, scale, surfaceLocalX }, items, room);
  return attached ? {
    ...item,
    scale,
    surfaceLocalX,
    x: attached.x,
    y: attached.y,
    zIndex: attached.zIndex,
  } : item;
}

export function clampCutoutPlacement(
  item: PetRoomItem,
  items: readonly PetRoomItem[],
  room: RoomSize = DEFAULT_ROOM_SIZE,
): PetRoomItem {
  return normalizeCutoutPlacementType(item.placementType) === 'surface'
    ? clampSurfaceCutout(item, items, room)
    : clampRoomItemPlacement(item, room) as PetRoomItem;
}

export function moveSurfaceCutout(
  item: PetRoomItem,
  items: readonly PetRoomItem[],
  deltaX: number,
  room: RoomSize = DEFAULT_ROOM_SIZE,
  deltaY = 0,
): PetRoomItem {
  const host = items.find((candidate) => candidate.id === item.surfaceHostItemId);
  const surface = host && item.surfaceId ? resolvePlacementSurface(host, item.surfaceId, room) : null;
  if (!surface) return clampSurfaceCutout(item, items, room);
  const localDelta = Math.cos(surface.angle) * deltaX + Math.sin(surface.angle) * deltaY;
  return clampSurfaceCutout({
    ...item,
    surfaceLocalX: Number(item.surfaceLocalX ?? 0) + localDelta / Math.max(1, surface.width),
  }, items, room);
}

export function transitionCutoutPlacement(
  item: PetRoomItem,
  placementType: PetRoomCutoutPlacementType,
  items: readonly PetRoomItem[],
  room: RoomSize = DEFAULT_ROOM_SIZE,
  target?: { hostItemId: string; surfaceId: string },
): PetRoomItem {
  if (item.catalogItemId !== 'cutout') return item;
  if (placementType === 'surface') {
    const host = items.find((candidate) => candidate.id === target?.hostItemId);
    if (!host || !target || !placementSurfacesForItem(host).some((surface) => surface.id === target.surfaceId)) return item;
    return clampSurfaceCutout({
      ...item,
      placementType,
      surfaceHostItemId: host.id,
      surfaceId: target.surfaceId,
      surfaceLocalX: 0,
      zIndex: host.zIndex + 1,
    }, items, room);
  }
  const base = {
    ...item,
    placementType,
    surfaceHostItemId: null,
    surfaceId: null,
    surfaceLocalX: null,
  };
  if (placementType === 'wall') {
    const unit = resolveItemVisualSizePx({ ...base, scale: 1 }, room);
    const wallHeight = room.height * (PET_WALL_BOUNDS.maxY - PET_WALL_BOUNDS.minY);
    const cap = Math.min(1, room.width * 0.38 / Math.max(1, unit.width), wallHeight * 0.62 / Math.max(1, unit.height));
    return clampRoomItemPlacement({ ...base, x: 0.5, y: 0.27, scale: Math.min(base.scale, cap), zIndex: 10 }, room) as PetRoomItem;
  }
  return clampRoomItemPlacement({
    ...base,
    x: Math.max(PET_FLOOR_BOUNDS.minX, Math.min(PET_FLOOR_BOUNDS.maxX, base.x)),
    y: Math.max(PET_ROOM_CATALOG.cutout.defaultY, base.y),
    zIndex: PET_ROOM_CATALOG.cutout.zIndex,
  }, room) as PetRoomItem;
}

export function detachSurfaceCutoutsForDeletedHost(
  items: readonly PetRoomItem[],
  hostItemId: string,
  room: RoomSize = DEFAULT_ROOM_SIZE,
): PetRoomItem[] {
  return items.map((item) => {
    if (item.catalogItemId !== 'cutout'
      || normalizeCutoutPlacementType(item.placementType) !== 'surface'
      || item.surfaceHostItemId !== hostItemId) return item;
    const resolved = resolveCutoutRoomPlacement(item, items, room);
    return transitionCutoutPlacement(resolved, 'floor', items, room);
  });
}

/**
 * Pure freeform frame geometry. The dragged edge follows the finger, the
 * opposite edge is anchored, and each axis clamps without mutating the other.
 */
export function resizeRoomPhotoFrame(input: {
  item: PetRoomItem;
  handle: FrameResizeHandle;
  deltaX: number;
  deltaY: number;
  room: RoomSize;
}): PetRoomItem {
  const { item, handle, room } = input;
  if (!isPhotoFrameItem(item)) return item;
  const wall = usableWallSize(room);
  const limits = frameDimensionLimits(room);
  const rendered = resolveFrameRenderSize(item, room);
  const startWidth = rendered.width / wall.width;
  const startHeight = rendered.height / wall.height;
  const startHeightRoom = startHeight * (PET_WALL_BOUNDS.maxY - PET_WALL_BOUNDS.minY);
  const minHeightRoom = limits.minHeight * (PET_WALL_BOUNDS.maxY - PET_WALL_BOUNDS.minY);
  const maxHeightRoom = limits.maxHeight * (PET_WALL_BOUNDS.maxY - PET_WALL_BOUNDS.minY);
  const start = {
    left: item.x - startWidth / 2,
    right: item.x + startWidth / 2,
    top: item.y - startHeightRoom / 2,
    bottom: item.y + startHeightRoom / 2,
  };
  let left = start.left;
  let right = start.right;
  let top = start.top;
  let bottom = start.bottom;
  const dx = input.deltaX / Math.max(1, room.width);
  const dy = input.deltaY / Math.max(1, room.height);
  const changesLeft = handle === 'left' || handle === 'topLeft' || handle === 'bottomLeft';
  const changesRight = handle === 'right' || handle === 'topRight' || handle === 'bottomRight';
  const changesTop = handle === 'top' || handle === 'topLeft' || handle === 'topRight';
  const changesBottom = handle === 'bottom' || handle === 'bottomLeft' || handle === 'bottomRight';

  // Frames are universal canvas objects — resize within full Room recovery bounds.
  if (changesLeft) left = Math.max(PET_CANVAS_BOUNDS.minX, Math.min(right - limits.minWidth, Math.max(right - limits.maxWidth, start.left + dx)));
  if (changesRight) right = Math.min(PET_CANVAS_BOUNDS.maxX, Math.max(left + limits.minWidth, Math.min(left + limits.maxWidth, start.right + dx)));
  if (changesTop) top = Math.max(PET_CANVAS_BOUNDS.minY, Math.min(bottom - minHeightRoom, Math.max(bottom - maxHeightRoom, start.top + dy)));
  if (changesBottom) bottom = Math.min(PET_CANVAS_BOUNDS.maxY, Math.max(top + minHeightRoom, Math.min(top + maxHeightRoom, start.bottom + dy)));

  return {
    ...item,
    x: changesLeft || changesRight ? (left + right) / 2 : item.x,
    y: changesTop || changesBottom ? (top + bottom) / 2 : item.y,
    scale: 1,
    normalizedWidth: changesLeft || changesRight ? right - left : startWidth,
    normalizedHeight: changesTop || changesBottom
      ? (bottom - top) / (PET_WALL_BOUNDS.maxY - PET_WALL_BOUNDS.minY)
      : startHeight,
  };
}

export function resolveVisibleRoomPets(pets: CouplePet[], visiblePetIds: string[]): CouplePet[] {
  const requested = new Set(visiblePetIds);
  const visible = pets.filter((pet) => requested.has(pet.id));
  if (visible.length > 0 || pets.length === 0) return visible;
  // An empty list means the room is still loading, is on a pre-room schema, or
  // could not hydrate. It is not an explicit "hide every pet" choice (the RPC
  // forbids that), so preserve the original shared-space behavior.
  return pets;
}

/**
 * Room focus is a local viewing/interaction choice. It deliberately does not
 * change the globally active (Today/featured) pet or a Room visibility list.
 */
export function resolveFocusedRoomPetId(
  focusedPetId: string | null | undefined,
  pets: readonly Pick<CouplePet, 'id'>[],
  fallbackPetId: string | null | undefined,
): string | null {
  const ids = new Set(pets.map((pet) => pet.id));
  if (focusedPetId && ids.has(focusedPetId)) return focusedPetId;
  if (fallbackPetId && ids.has(fallbackPetId)) return fallbackPetId;
  return pets[0]?.id ?? null;
}

export function toggleVisiblePetId(visiblePetIds: string[], petId: string): { visiblePetIds: string[]; rejectedFinal: boolean } {
  if (visiblePetIds.includes(petId)) {
    if (visiblePetIds.length === 1) return { visiblePetIds, rejectedFinal: true };
    return { visiblePetIds: visiblePetIds.filter((id) => id !== petId), rejectedFinal: false };
  }
  return { visiblePetIds: [...visiblePetIds, petId], rejectedFinal: false };
}

export type RoomCanvasResetScope = 'our_room' | 'game_room';

/** Keeps the opposite space's items when resetting one room canvas. */
export function resetRoomCanvasItemsForScope(
  items: readonly PetRoomItem[],
  scope: RoomCanvasResetScope,
): PetRoomItem[] {
  return scope === 'game_room'
    ? items.filter((item) => !isGameRoomOnlyItemKind(item.catalogItemId))
    : items.filter((item) => isGameRoomOnlyItemKind(item.catalogItemId));
}

/** Clean, non-persisted starter canvas; couples add every decorative object. */
export function defaultRoomItems(roomId = 'local'): PetRoomItem[] {
  return buildDefaultRoomItems(roomId, []);
}

/** Runtime-only immersive fallback; persisted room rows always take priority. */
export function defaultInteractiveRoomItems(roomId = 'local'): PetRoomItem[] {
  return buildDefaultRoomItems(roomId, ['bowl', 'toy']);
}

function buildDefaultRoomItems(roomId: string, kinds: PetRoomItemKind[]): PetRoomItem[] {
  const now = new Date(0).toISOString();
  return kinds.map((id, index) => {
    const catalog = PET_ROOM_CATALOG[id];
    const isFrame = id === 'photo_frame';
    return {
      id: `default-${id}-${index}`,
      roomId,
      catalogItemId: id,
      x: id === 'photo_frame' && index === kinds.length - 1 ? 0.88 : catalog.defaultX,
      y: id === 'photo_frame' && index === kinds.length - 1 ? 0.30 : catalog.defaultY,
      scale: catalog.defaultScale,
      rotation: 0,
      flipX: false,
      zIndex: catalog.zIndex,
      photo: null,
      cutout: null,
      textObject: null,
      frameSize: isFrame ? 'medium' : null,
      frameStyle: isFrame ? (index === kinds.length - 1 ? 'square' : 'classic') : null,
      normalizedWidth: null,
      normalizedHeight: null,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    };
  });
}

/** Backward-compatible photo parse: missing fields never crash room load. */
export function normalizeRoomPhoto(raw: Partial<PetRoomPhoto> | null | undefined): PetRoomPhoto | null {
  if (!raw?.path || !raw.bucket || !raw.sourceType) return null;
  return {
    sourceType: raw.sourceType,
    sourceId: raw.sourceId ?? null,
    bucket: raw.bucket,
    path: raw.path,
    width: raw.width ?? null,
    height: raw.height ?? null,
    focalX: typeof raw.focalX === 'number' && Number.isFinite(raw.focalX) ? raw.focalX : 0.5,
    focalY: typeof raw.focalY === 'number' && Number.isFinite(raw.focalY) ? raw.focalY : 0.5,
    zoom: typeof raw.zoom === 'number' && Number.isFinite(raw.zoom) && raw.zoom > 0 ? raw.zoom : 1,
    signedUrl: raw.signedUrl,
  };
}

export function normalizeRoomItemFrameFields(
  item: Pick<PetRoomItem, 'catalogItemId' | 'frameSize' | 'frameStyle' | 'normalizedWidth' | 'normalizedHeight'>,
): Pick<PetRoomItem, 'frameSize' | 'frameStyle' | 'normalizedWidth' | 'normalizedHeight'> {
  const isFrame = item.catalogItemId === 'photo_frame' || item.catalogItemId === 'photo_strip_frame';
  if (!isFrame) return { frameSize: null, frameStyle: null, normalizedWidth: null, normalizedHeight: null };
  const hasFreeform = Number.isFinite(item.normalizedWidth) && Number.isFinite(item.normalizedHeight)
    && Number(item.normalizedWidth) > 0 && Number(item.normalizedHeight) > 0;
  return {
    frameSize: normalizeFrameSize(item.frameSize),
    frameStyle: normalizeFrameStyle(item.frameStyle),
    normalizedWidth: hasFreeform ? Number(item.normalizedWidth) : null,
    normalizedHeight: hasFreeform ? Number(item.normalizedHeight) : null,
  };
}

export function resolveInteractionOffset(input: { roomWidth: number; petHomeX: number; item: PetRoomItem; kind: 'bed' | 'bowl' | 'toy' }) {
  const targetX = input.item.x * input.roomWidth;
  const raw = (targetX - input.petHomeX) * 0.58;
  const magnitude = Math.max(20, Math.min(55, Math.abs(raw)));
  return { translateX: raw === 0 ? 0 : Math.sign(raw) * magnitude, translateY: input.kind === 'bed' ? 4 : 3 };
}
