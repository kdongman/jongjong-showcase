/**
 * Stable subject placement SSOT for Review / editor / export.
 *
 * - Identity is participantId (SubjectId), never visual left/right.
 * - Manual mode stores absolute normalized visible rects on the logical 1200×900 frame.
 * - Auto mode uses compact packing; first drag bakes the drawn rect into manual.
 */

import {
  computeSameSpacePersonPlacement,
  defaultPersonBounds,
  type SameSpacePersonBounds,
  type SameSpacePersonPlacement,
} from './sameSpaceComposition';
import {
  DEFAULT_SAME_SPACE_MANUAL_OFFSET,
  type SameSpaceCompositionSlot,
  type SameSpaceManualOffset,
  type SameSpaceSoloLayout,
} from './sameSpaceLayoutSpec';
import {
  BOOTH_SCENE_LOGICAL_WIDTH,
  BOOTH_SCENE_LOGICAL_HEIGHT,
  type BoothSceneSpanMode,
} from './boothSceneSpec';
import { computeCompactCoupleComposition } from './compactCoupleComposition';
import {
  stageRectFromPixels,
  stageRectToPixels,
  type BoothStageNormalizedRect,
} from './coupleBoothStage';

export type SubjectId = string;

export type NormalizedSubjectRect = BoothStageNormalizedRect;

export type SubjectPlacement = {
  mode: 'auto' | 'manual';
  /** Visible (alpha) subject rect in normalized logical-frame coords. Null when auto. */
  rect: NormalizedSubjectRect | null;
};

export type ShotModePlacements = Record<SubjectId, SubjectPlacement>;

export type ShotCompositionPlacements = {
  one_cell: ShotModePlacements;
  two_cell: ShotModePlacements;
  frontSubjectId?: SubjectId | null;
};

export const LOGICAL_FRAME = {
  width: BOOTH_SCENE_LOGICAL_WIDTH,
  height: BOOTH_SCENE_LOGICAL_HEIGHT,
} as const;

export const DEFAULT_SUBJECT_PLACEMENT: SubjectPlacement = {
  mode: 'auto',
  rect: null,
};

export function emptyShotCompositionPlacements(): ShotCompositionPlacements {
  return { one_cell: {}, two_cell: {}, frontSubjectId: null };
}

export function clampNormalizedRect(rect: NormalizedSubjectRect): NormalizedSubjectRect {
  const width = Math.min(2, Math.max(0.01, Number.isFinite(rect.width) ? rect.width : 0.2));
  const height = Math.min(2, Math.max(0.01, Number.isFinite(rect.height) ? rect.height : 0.4));
  const x = Number.isFinite(rect.x) ? rect.x : 0.1;
  const y = Number.isFinite(rect.y) ? rect.y : 0.1;
  return { x, y, width, height };
}

export function normalizeLogicalRect(
  logical: { x: number; y: number; width: number; height: number },
  frameWidth: number = LOGICAL_FRAME.width,
  frameHeight: number = LOGICAL_FRAME.height,
): NormalizedSubjectRect {
  return clampNormalizedRect(stageRectFromPixels(logical, frameWidth, frameHeight));
}

export function denormalizeRect(
  rect: NormalizedSubjectRect,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; width: number; height: number } {
  const n = clampNormalizedRect(rect);
  return stageRectToPixels(n, frameWidth, frameHeight);
}

/** Alpha-visible dest → full bitmap dest (accounts for transparent padding). */
export function bitmapDrawRectFromVisibleRect(
  visible: { x: number; y: number; width: number; height: number },
  alphaBounds: SameSpacePersonBounds,
): { x: number; y: number; width: number; height: number } {
  const bw = Math.max(0.05, alphaBounds.maxX - alphaBounds.minX);
  const bh = Math.max(0.05, alphaBounds.maxY - alphaBounds.minY);
  const destWidth = visible.width / bw;
  const destHeight = visible.height / bh;
  return {
    x: visible.x - alphaBounds.minX * destWidth,
    y: visible.y - alphaBounds.minY * destHeight,
    width: destWidth,
    height: destHeight,
  };
}

/** Full bitmap dest → alpha-visible personDest. */
export function visibleSubjectDrawRectFromBitmap(
  dest: { x: number; y: number; width: number; height: number },
  alphaBounds: SameSpacePersonBounds,
): { x: number; y: number; width: number; height: number } {
  const bw = Math.max(0.05, alphaBounds.maxX - alphaBounds.minX);
  const bh = Math.max(0.05, alphaBounds.maxY - alphaBounds.minY);
  return {
    x: dest.x + alphaBounds.minX * dest.width,
    y: dest.y + alphaBounds.minY * dest.height,
    width: bw * dest.width,
    height: bh * dest.height,
  };
}

export function cloneSubjectPlacement(p: SubjectPlacement): SubjectPlacement {
  return {
    mode: p.mode === 'manual' ? 'manual' : 'auto',
    rect: p.rect ? clampNormalizedRect(p.rect) : null,
  };
}

export function cloneShotCompositionPlacements(
  value: ShotCompositionPlacements | null | undefined,
): ShotCompositionPlacements {
  const src = value ?? emptyShotCompositionPlacements();
  const cloneMode = (row: ShotModePlacements): ShotModePlacements => {
    const out: ShotModePlacements = {};
    for (const [id, placement] of Object.entries(row ?? {})) {
      out[id] = cloneSubjectPlacement(placement);
    }
    return out;
  };
  return {
    one_cell: cloneMode(src.one_cell),
    two_cell: cloneMode(src.two_cell),
    frontSubjectId: src.frontSubjectId ?? null,
  };
}

export function placementForSubject(
  shot: ShotCompositionPlacements | null | undefined,
  spanMode: BoothSceneSpanMode,
  subjectId: SubjectId,
): SubjectPlacement {
  const modeMap = spanMode === 'one_cell' ? shot?.one_cell : shot?.two_cell;
  return cloneSubjectPlacement(modeMap?.[subjectId] ?? DEFAULT_SUBJECT_PLACEMENT);
}

export function setPlacementForSubject(
  shot: ShotCompositionPlacements,
  spanMode: BoothSceneSpanMode,
  subjectId: SubjectId,
  placement: SubjectPlacement,
): ShotCompositionPlacements {
  const next = cloneShotCompositionPlacements(shot);
  const key = spanMode === 'one_cell' ? 'one_cell' : 'two_cell';
  next[key] = {
    ...next[key],
    [subjectId]: cloneSubjectPlacement(placement),
  };
  return next;
}

export function bakeVisibleRectToManualPlacement(
  visibleLogical: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
): SubjectPlacement {
  return {
    mode: 'manual',
    rect: normalizeLogicalRect(visibleLogical, frameWidth, frameHeight),
  };
}

export type ResolveSubjectDrawRectInput = {
  frameWidth: number;
  frameHeight: number;
  placement: SubjectPlacement;
  alphaBounds?: SameSpacePersonBounds | null;
  sourceWidth: number;
  sourceHeight: number;
  /** Used only for auto mode home packing. */
  homeSlot: SameSpaceCompositionSlot;
  soloLayout?: SameSpaceSoloLayout;
  participantCount?: number;
  spanMode: BoothSceneSpanMode;
  /** Auto packing companions (both required for couple packing). */
  autoPacking?: {
    leftBounds: SameSpacePersonBounds;
    rightBounds: SameSpacePersonBounds;
    leftManual?: SameSpaceManualOffset | null;
    rightManual?: SameSpaceManualOffset | null;
    slotManual?: SameSpaceManualOffset | null;
  } | null;
};

/**
 * Single draw-rect resolver for editor / preview / export.
 * Manual → absolute normalized rect. Auto → compact packing path.
 */
export function resolveSubjectDrawRect(input: ResolveSubjectDrawRectInput): SameSpacePersonPlacement {
  const bounds = input.alphaBounds && (input.alphaBounds.maxX > input.alphaBounds.minX)
    ? input.alphaBounds
    : defaultPersonBounds();

  if (input.placement.mode === 'manual' && input.placement.rect) {
    const personDest = denormalizeRect(input.placement.rect, input.frameWidth, input.frameHeight);
    const dest = bitmapDrawRectFromVisibleRect(personDest, bounds);
    return {
      sourceCrop: {
        x: 0,
        y: 0,
        width: Math.max(1, input.sourceWidth),
        height: Math.max(1, input.sourceHeight),
      },
      dest,
      scale: dest.width / Math.max(1, input.sourceWidth),
      anchor: {
        x: personDest.x + personDest.width / 2,
        y: personDest.y + personDest.height,
      },
      clippingSafeArea: { x: 0, y: 0, width: 1, height: 1 },
      slot: input.homeSlot,
      role: input.homeSlot,
      clipBoundary: 'none',
      edgeTouch: { left: false, right: false, top: false, bottom: false },
      personDest,
    };
  }

  let manual = input.autoPacking?.slotManual ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET;
  if (input.autoPacking?.leftBounds && input.autoPacking?.rightBounds) {
    const compact = computeCompactCoupleComposition({
      sceneWidth: input.frameWidth,
      sceneHeight: input.frameHeight,
      leftBounds: input.autoPacking.leftBounds,
      rightBounds: input.autoPacking.rightBounds,
      leftManual: input.autoPacking.leftManual ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
      rightManual: input.autoPacking.rightManual ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
      spanMode: input.spanMode,
    });
    manual = input.homeSlot === 'left' ? compact.leftTransform : compact.rightTransform;
  }

  return computeSameSpacePersonPlacement({
    canvasWidth: input.frameWidth,
    canvasHeight: input.frameHeight,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    personBounds: bounds,
    manualOffset: manual,
    slot: input.homeSlot,
    soloLayout: input.soloLayout ?? 'half',
    participantCount: input.participantCount ?? 2,
    spanMode: input.spanMode,
  });
}

/**
 * One-shot legacy left/right offset → absolute subject placements for a span mode.
 * Uses the already-computed visible personDest (after packing) so migration matches
 * what the user last saw under the old system.
 */
export function migrateLegacyOffsetsToAbsolute(args: {
  leftSubjectId: SubjectId;
  rightSubjectId: SubjectId;
  leftPersonDest: { x: number; y: number; width: number; height: number };
  rightPersonDest: { x: number; y: number; width: number; height: number };
  frameWidth: number;
  frameHeight: number;
  leftWasEdited: boolean;
  rightWasEdited: boolean;
  frontSubjectId?: SubjectId | null;
}): ShotModePlacements {
  const out: ShotModePlacements = {};
  out[args.leftSubjectId] = args.leftWasEdited
    ? bakeVisibleRectToManualPlacement(args.leftPersonDest, args.frameWidth, args.frameHeight)
    : { ...DEFAULT_SUBJECT_PLACEMENT };
  out[args.rightSubjectId] = args.rightWasEdited
    ? bakeVisibleRectToManualPlacement(args.rightPersonDest, args.frameWidth, args.frameHeight)
    : { ...DEFAULT_SUBJECT_PLACEMENT };
  return out;
}

export function isIdentityManualOffset(offset: SameSpaceManualOffset | null | undefined): boolean {
  if (!offset) return true;
  return Math.abs(offset.offsetX) < 1e-6
    && Math.abs(offset.offsetY) < 1e-6
    && Math.abs(offset.scale - 1) < 1e-6;
}

export function rectsNearlyEqual(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  tolerancePx = 1,
): boolean {
  return Math.abs(a.x - b.x) <= tolerancePx
    && Math.abs(a.y - b.y) <= tolerancePx
    && Math.abs(a.width - b.width) <= tolerancePx
    && Math.abs(a.height - b.height) <= tolerancePx;
}

/** Dev/test assertion helper — returns null when OK. */
export function assertManualPlacementStable(args: {
  label: string;
  expected: { x: number; y: number; width: number; height: number };
  actual: { x: number; y: number; width: number; height: number };
  tolerancePx?: number;
}): string | null {
  if (rectsNearlyEqual(args.expected, args.actual, args.tolerancePx ?? 1)) return null;
  return `${args.label}: expected ${JSON.stringify(args.expected)} got ${JSON.stringify(args.actual)}`;
}
