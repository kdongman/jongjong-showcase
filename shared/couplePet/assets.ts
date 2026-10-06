import type { PetBoothPoseKey, PetGrowthStage, PetSpecies, PetSpeciesKey } from './types';
import { isPetGrowthStage, isPetSpecies, PET_SPECIES_DISPLAY_FALLBACK } from './types';

export type PetAssetRef = {
  webPath: string;
  key: string;
  kind: 'svg' | 'bitmap';
};

export const TIGER_PRODUCTION_ASSET_KEY = 'tiger_production' as const;
export const TIGER_BLINK_ASSET_KEY = 'tiger_blink' as const;
export const TIGER_WEB_RUNTIME_PATH = '/pets/tiger.png' as const;
export const TIGER_BLINK_WEB_RUNTIME_PATH = '/pets/tiger-blink.png' as const;
export const YORKIE_PRODUCTION_ASSET_KEY = 'yorkie_dog_production' as const;
export const YORKIE_WEB_RUNTIME_PATH = '/pets/yorkie-dog.png' as const;
export const YORKIE_BLINK_ASSET_KEY = 'yorkie_dog_blink' as const;
export const YORKIE_BLINK_WEB_RUNTIME_PATH = '/pets/yorkie-dog-blink.png' as const;
/** Production expression keys. Native builds resolve these through Metro static requires. */
export const CICI_HAPPY_ASSET_KEY = 'cici_happy' as const;
export const CICI_SLEEPING_ASSET_KEY = 'cici_sleeping' as const;
export const GGG_HAPPY_ASSET_KEY = 'ggg_happy' as const;
export const GGG_SLEEPING_ASSET_KEY = 'ggg_sleeping' as const;

const TIGER_ASSET: PetAssetRef = {
  key: TIGER_PRODUCTION_ASSET_KEY,
  webPath: TIGER_WEB_RUNTIME_PATH,
  kind: 'bitmap',
};
const TIGER_BLINK_ASSET: PetAssetRef = {
  key: TIGER_BLINK_ASSET_KEY,
  webPath: TIGER_BLINK_WEB_RUNTIME_PATH,
  kind: 'bitmap',
};
const YORKIE_ASSET: PetAssetRef = {
  key: YORKIE_PRODUCTION_ASSET_KEY,
  webPath: YORKIE_WEB_RUNTIME_PATH,
  kind: 'bitmap',
};
const YORKIE_BLINK_ASSET: PetAssetRef = {
  key: YORKIE_BLINK_ASSET_KEY,
  webPath: YORKIE_BLINK_WEB_RUNTIME_PATH,
  kind: 'bitmap',
};
const CICI_HAPPY_ASSET: PetAssetRef = {
  key: CICI_HAPPY_ASSET_KEY,
  webPath: '/pets/cici-happy.png',
  kind: 'bitmap',
};
const CICI_SLEEPING_ASSET: PetAssetRef = {
  key: CICI_SLEEPING_ASSET_KEY,
  webPath: '/pets/cici-sleeping.png',
  kind: 'bitmap',
};
const GGG_HAPPY_ASSET: PetAssetRef = {
  key: GGG_HAPPY_ASSET_KEY,
  webPath: '/pets/ggg-happy.png',
  kind: 'bitmap',
};
const GGG_SLEEPING_ASSET: PetAssetRef = {
  key: GGG_SLEEPING_ASSET_KEY,
  webPath: '/pets/ggg-sleeping.png',
  kind: 'bitmap',
};

/**
 * Per-species visual layout — anchors on visible content, not PNG canvas center.
 * Open-eye and blink frames must share the same layout values.
 */
export type PetVisualLayout = {
  canvasWidth: number;
  canvasHeight: number;
  /** Visible feet as a fraction of canvas height from the top (alpha bbox bottom). */
  footBaseline: number;
  /** Visible content center X as a fraction of canvas width. */
  contentCenterX: number;
  /** Visible content left X as a fraction of canvas width (alpha bbox left). */
  contentLeftX: number;
  /** Detail-room display scale, applied around the foot anchor. */
  roomScale: number;
  /** Selector thumbnail scale inside the fixed thumb frame. */
  thumbnailScale: number;
};

export type PetVisualAssets = {
  default: PetAssetRef;
  blink?: PetAssetRef;
  /** Optional same-canvas happiness expression. */
  happy?: PetAssetRef;
  /** Optional same-canvas sleeping expression. */
  sleeping?: PetAssetRef;
  /** Optional hard-swapped content expression used while a real stroke is happy. */
  /** @deprecated Register new art as `happy`. Kept for existing asset manifests. */
  pettingHappy?: PetAssetRef;
  /** @deprecated Register new art as `sleeping`. Kept for existing asset manifests. */
  sleepingAsset?: PetAssetRef;
  visual?: PetVisualLayout;
  /** Corrects production-sheet pose crops to the canonical visible silhouette. */
  expressionAlignment?: Partial<Record<'happy' | 'sleeping', PetExpressionAlignment>>;
};

export type PetExpressionAlignment = {
  /** Scale around the canonical foot baseline, never around the PNG center. */
  scale: number;
  /** Horizontal correction as a fraction of the canonical canvas width. */
  translateXRatio: number;
};

export type PetExpressionAssetSet = {
  idle: PetAssetRef;
  blink?: PetAssetRef;
  happy?: PetAssetRef;
  sleeping?: PetAssetRef;
};

/**
 * Expression source-of-truth: each pet's IDLE bitmap is the canonical master.
 * blink / happy / sleeping must be face-only derivatives of that master
 * (same body, fur palette, silhouette, canvas, foot baseline) — never full redraws.
 */
/** Future expression PNGs must preserve the canonical canvas, baseline, and alignment. */
export const PET_EXPRESSION_ASSET_CONTRACTS = {
  dog: {
    assetKeys: { happy: CICI_HAPPY_ASSET_KEY, sleeping: CICI_SLEEPING_ASSET_KEY },
    format: 'png',
    transparent: true,
    canvasWidth: 1536,
    canvasHeight: 1024,
    footBaseline: 0.8798828125,
    contentCenterX: 0.5123697916666666,
    contentLeftX: 0.2864583333333333,
    requiredFutureExpressions: ['happy', 'sleeping'] as const,
  },
  tiger: {
    assetKeys: { happy: GGG_HAPPY_ASSET_KEY, sleeping: GGG_SLEEPING_ASSET_KEY },
    format: 'png',
    transparent: true,
    canvasWidth: 1536,
    canvasHeight: 1208,
    footBaseline: 0.8634105960264901,
    contentCenterX: 0.48046875,
    contentLeftX: 0.2571614583333333,
    requiredFutureExpressions: ['happy', 'sleeping'] as const,
  },
} as const;

export type PetSpeciesDefinition = {
  key: PetSpeciesKey;
  displayName: { en: string; ko: string };
  species: PetSpecies;
  assetSet: PetVisualAssets;
  animationSet: readonly ['idle', 'blink', 'look', 'happy', 'sleep', 'react'];
};

/**
 * Room ground line: distance from the room container bottom to the wall/floor
 * boundary. Matches PetRoomScene floor height — tall enough that the pet
 * clearly stands ON the floor plane (not bisected by a hard wall edge).
 */
export const PET_GROUND_Y_FROM_BOTTOM = 148 as const;

export const PET_SPECIES_REGISTRY: Record<PetSpeciesKey, PetSpeciesDefinition> = {
  jongjong_tiger: {
    key: 'jongjong_tiger', displayName: { en: 'JONGJONG Tiger', ko: '종종 호랑이' }, species: 'tiger',
    assetSet: {
      default: TIGER_ASSET,
      blink: TIGER_BLINK_ASSET,
      happy: GGG_HAPPY_ASSET,
      sleeping: GGG_SLEEPING_ASSET,
      expressionAlignment: {
        // Happy/sleeping rebuilt from canonical idle (face-only) — bounds match; no compensation.
        happy: { scale: 1, translateXRatio: 0 },
        sleeping: { scale: 1, translateXRatio: 0 },
      },
      visual: {
        canvasWidth: 1536,
        canvasHeight: 1208,
        footBaseline: 0.8634105960264901,
        contentCenterX: 0.48046875,
        contentLeftX: 0.2571614583333333,
        roomScale: 1,
        thumbnailScale: 1.05,
      },
    },
    animationSet: ['idle', 'blink', 'look', 'happy', 'sleep', 'react'],
  },
  yorkie_dog: {
    key: 'yorkie_dog', displayName: { en: 'Yorkshire Dog', ko: '요크셔 강아지' }, species: 'dog',
    assetSet: {
      default: YORKIE_ASSET,
      blink: YORKIE_BLINK_ASSET,
      happy: CICI_HAPPY_ASSET,
      sleeping: CICI_SLEEPING_ASSET,
      expressionAlignment: {
        // Happy/sleeping rebuilt from canonical idle (face-only) — bounds match; no compensation.
        happy: { scale: 1, translateXRatio: 0 },
        sleeping: { scale: 1, translateXRatio: 0 },
      },
      visual: {
        canvasWidth: 1536,
        canvasHeight: 1024,
        footBaseline: 0.8798828125,
        contentCenterX: 0.5123697916666666,
        contentLeftX: 0.2864583333333333,
        // Wider canvas padding + shorter aspect → bump scale so visible body matches tiger presence.
        roomScale: 1.18,
        thumbnailScale: 1.22,
      },
    },
    animationSet: ['idle', 'blink', 'look', 'happy', 'sleep', 'react'],
  },
};

export function speciesKeyForPet(catalogKey: string, species: PetSpecies): PetSpeciesKey | null {
  if (catalogKey === 'tiger_jongjong' || species === 'tiger') return 'jongjong_tiger';
  if (catalogKey === 'yorkie_dog') return 'yorkie_dog';
  return null;
}

/** Pet asset registry; tiger uses one canonical native bitmap for every growth stage.
 *
 * Future CDN / Supabase Storage swap checklist:
 * - Set img.crossOrigin = 'anonymous' BEFORE assigning src
 * - Ensure Storage/CDN responses send Access-Control-Allow-Origin for the Booth origin
 * - Handle signed URL expiry before canvas export
 * - Canvas taint from missing CORS will fail toBlob/export
 * - External SVG nested resources also need same-origin or CORS
 * - Prefer catalog asset_key → local/CDN registry; never draw arbitrary remote asset_url from client input
 */
export function petStageAsset(species: PetSpecies, stage: PetGrowthStage): PetAssetRef {
  if (species === 'tiger') return TIGER_ASSET;
  if (species === 'dog') return YORKIE_ASSET;
  return {
    key: `${species}_${stage}`,
    webPath: `/pets/${species}_${stage}.svg`,
    kind: 'svg',
  };
}

export function petVisualAssets(species: PetSpecies, stage: PetGrowthStage): PetVisualAssets {
  if (species === 'tiger') return PET_SPECIES_REGISTRY.jongjong_tiger.assetSet;
  if (species === 'dog') return PET_SPECIES_REGISTRY.yorkie_dog.assetSet;
  return { default: petStageAsset(species, stage) };
}

/** Normalizes legacy names into the V1 idle/blink/happy/sleeping contract. */
export function petExpressionAssets(species: PetSpecies, stage: PetGrowthStage): PetExpressionAssetSet {
  const assets = petVisualAssets(species, stage);
  return {
    idle: assets.default,
    blink: assets.blink,
    happy: assets.happy ?? assets.pettingHappy,
    sleeping: assets.sleeping ?? assets.sleepingAsset,
  };
}

/**
 * Distance from the rendered image box bottom to the visible feet.
 * Used so PetRoomScene can pin feet to PET_GROUND_Y_FROM_BOTTOM.
 */
export function petFootInsetFromBoxBottom(
  visual: PetVisualLayout | undefined,
  boxHeight: number,
): number {
  const footBaseline = visual?.footBaseline ?? 1;
  return (1 - footBaseline) * boxHeight;
}

/**
 * Horizontal shift so the visible content center sits on the stage center.
 * Positive = move image right.
 */
export function petContentCenterShiftX(
  visual: PetVisualLayout | undefined,
  boxWidth: number,
): number {
  const contentCenterX = visual?.contentCenterX ?? 0.5;
  return (0.5 - contentCenterX) * boxWidth;
}

/** Visible-content left inside a display box after content-center alignment. */
export function petVisibleContentLeftInBox(
  visual: PetVisualLayout | undefined,
  boxWidth: number,
): number {
  const contentCenterX = visual?.contentCenterX ?? 0.5;
  const contentLeftX = visual?.contentLeftX ?? Math.max(0, contentCenterX - 0.226);
  return (contentLeftX - contentCenterX + 0.5) * boxWidth;
}

export function petPoseAsset(species: PetSpecies, pose: PetBoothPoseKey): PetAssetRef {
  if (species === 'tiger') return TIGER_ASSET;
  if (species === 'dog') return YORKIE_ASSET;
  return {
    key: `${species}_pose_${pose}`,
    webPath: `/pets/poses/${species}_${pose}.svg`,
    kind: 'svg',
  };
}

export function normalizePetStage(stage: unknown): PetGrowthStage {
  return isPetGrowthStage(stage) ? stage : 'baby';
}

export function normalizePetSpeciesForAsset(species: unknown): PetSpecies {
  return isPetSpecies(species) ? species : PET_SPECIES_DISPLAY_FALLBACK;
}

export function isTigerProductionAsset(ref: PetAssetRef): boolean {
  return ref.key === TIGER_PRODUCTION_ASSET_KEY && ref.webPath === TIGER_WEB_RUNTIME_PATH;
}

export const PET_POSE_LABELS: Record<PetBoothPoseKey, { en: string; ko: string }> = {
  sit_bottom_right: { en: 'Sit bottom-right', ko: '오른쪽 아래 앉기' },
  sit_bottom_left: { en: 'Sit bottom-left', ko: '왼쪽 아래 앉기' },
  peek_between: { en: 'Peek between us', ko: '둘 사이에서 고개 내밀기' },
  on_head: { en: 'On their head', ko: '머리 위에 올라가기' },
  hold_camera: { en: 'Hold the camera', ko: '카메라 들고 찍기' },
  heart_between: { en: 'Heart between us', ko: '둘 사이에서 하트' },
};
