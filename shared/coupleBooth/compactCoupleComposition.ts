import type { SameSpacePersonBounds } from './sameSpaceComposition';
import {
  SAME_SPACE_HOME_CENTER_X,
  clampManualOffset,
  type SameSpaceManualOffset,
} from './sameSpaceLayoutSpec';
import {
  getSceneFrameSpec,
  type BoothSceneSpanMode,
  LEGACY_BOOTH_SCENE_SPAN_MODE,
} from './boothSceneSpec';

export type CompactCoupleComposition = {
  leftTransform: SameSpaceManualOffset;
  rightTransform: SameSpaceManualOffset;
  /** Packing-only base (before user deltas). */
  leftBase: SameSpaceManualOffset;
  rightBase: SameSpaceManualOffset;
  coupleBounds: { minX: number; minY: number; maxX: number; maxY: number };
  visualGap: number;
  groupWidthRatio: number;
  groupHeightRatio: number;
};

type PackingTargets = {
  /** Combined visible width as fraction of the composition span. */
  groupWidth: number;
  /** Combined visible height as fraction of frame height. */
  groupHeight: number;
  gap: number;
  /** Home centers in full-frame normalized X. */
  homeLeft: number;
  homeRight: number;
  maxWidthBoost: number;
  maxHeightBoost: number;
};

function packingTargetsFor(spanMode: BoothSceneSpanMode): PackingTargets {
  const frame = getSceneFrameSpec(spanMode);
  const span = frame.spanRect;
  const spanMid = span.x + span.width / 2;
  if (spanMode === 'one_cell') {
    // Compact couple inside the half-width span corridor.
    return {
      groupWidth: 0.92,
      groupHeight: 0.64,
      gap: -0.01,
      homeLeft: spanMid - span.width * 0.12,
      homeRight: spanMid + span.width * 0.12,
      maxWidthBoost: 1.6,
      maxHeightBoost: 1.55,
    };
  }
  return {
    groupWidth: 0.74,
    groupHeight: 0.68,
    gap: 0.04,
    homeLeft: SAME_SPACE_HOME_CENTER_X.left,
    homeRight: SAME_SPACE_HOME_CENTER_X.right,
    maxWidthBoost: 1.35,
    maxHeightBoost: 1.45,
  };
}

const HEIGHT_RATIO_MIN = 0.85;
const HEIGHT_RATIO_MAX = 1.15;

function boundsHeight(b: SameSpacePersonBounds): number {
  return Math.max(0.05, b.maxY - b.minY);
}

function boundsWidth(b: SameSpacePersonBounds): number {
  return Math.max(0.05, b.maxX - b.minX);
}

/**
 * Combine span packing base with a user transform.
 * - manual: final = base ⊕ user (offsets add, scales multiply)
 * - auto + identity: packing base alone
 * - auto + non-identity (legacy baked): use stored values as-is
 */
export function applyCompactBaseToUser(
  base: SameSpaceManualOffset,
  user: SameSpaceManualOffset | null | undefined,
): SameSpaceManualOffset {
  const u = clampManualOffset(user);
  if (u.mode === 'manual') {
    return clampManualOffset({
      offsetX: base.offsetX + u.offsetX,
      offsetY: base.offsetY + u.offsetY,
      scale: base.scale * u.scale,
      mode: 'manual',
    });
  }
  const isIdentity = Math.abs(u.offsetX) < 1e-6
    && Math.abs(u.offsetY) < 1e-6
    && Math.abs(u.scale - 1) < 1e-6;
  if (!isIdentity) {
    return clampManualOffset({ ...u, mode: 'auto' });
  }
  return clampManualOffset({ ...base, mode: 'auto' });
}

/**
 * Couple packing for live/Review/export.
 * Returns packing BASE transforms. Callers that need a draw-ready manual
 * should use applyCompactBaseToUser(base, userManual).
 *
 * When both subjects are manual, leftTransform/rightTransform still equal
 * applyCompactBaseToUser so draw paths stay correct — but base stays separate
 * so mode changes can recompute packing without wiping user deltas.
 */
export function computeCompactCoupleComposition(input: {
  sceneWidth: number;
  sceneHeight: number;
  leftBounds: SameSpacePersonBounds;
  rightBounds: SameSpacePersonBounds;
  leftManual?: SameSpaceManualOffset | null;
  rightManual?: SameSpaceManualOffset | null;
  spanMode?: BoothSceneSpanMode;
}): CompactCoupleComposition {
  const spanMode = input.spanMode ?? LEGACY_BOOTH_SCENE_SPAN_MODE;
  const targets = packingTargetsFor(spanMode);
  void input.sceneWidth;
  void input.sceneHeight;

  const leftH = boundsHeight(input.leftBounds);
  const rightH = boundsHeight(input.rightBounds);
  const leftW = boundsWidth(input.leftBounds);
  const rightW = boundsWidth(input.rightBounds);

  let leftScale = 1;
  let rightScale = 1;
  const ratio = leftH / rightH;
  if (ratio > HEIGHT_RATIO_MAX) leftScale = HEIGHT_RATIO_MAX / ratio;
  else if (ratio < HEIGHT_RATIO_MIN) rightScale = ratio / HEIGHT_RATIO_MIN;

  const leftVisH = leftH * leftScale;
  const rightVisH = rightH * rightScale;
  const maxVisH = Math.max(leftVisH, rightVisH);
  const heightBoost = Math.min(
    targets.maxHeightBoost,
    Math.max(1, targets.groupHeight / Math.max(0.2, maxVisH)),
  );
  leftScale *= heightBoost;
  rightScale *= heightBoost;

  const gap = targets.gap;
  const combinedWidth = leftW * leftScale + rightW * rightScale + Math.max(0, gap);
  // groupWidth is relative to the composition span, not the full frame.
  const spanWidthNorm = getSceneFrameSpec(spanMode).spanRect.width;
  const widthBoost = Math.min(
    targets.maxWidthBoost,
    Math.max(1, (targets.groupWidth * spanWidthNorm) / Math.max(0.25, combinedWidth)),
  );
  leftScale *= widthBoost;
  rightScale *= widthBoost;

  const homeDeltaLeft = targets.homeLeft - SAME_SPACE_HOME_CENTER_X.left;
  const homeDeltaRight = targets.homeRight - SAME_SPACE_HOME_CENTER_X.right;

  let leftBase = clampManualOffset({
    offsetX: homeDeltaLeft,
    offsetY: 0,
    scale: leftScale,
    mode: 'auto',
  });
  let rightBase = clampManualOffset({
    offsetX: homeDeltaRight,
    offsetY: 0,
    scale: rightScale,
    mode: 'auto',
  });

  // Close residual gap toward the mode target (allows slight overlap in one_cell).
  const leftCenter = SAME_SPACE_HOME_CENTER_X.left + leftBase.offsetX;
  const rightCenter = SAME_SPACE_HOME_CENTER_X.right + rightBase.offsetX;
  const halfLeft = (leftW * leftBase.scale) / 2;
  const halfRight = (rightW * rightBase.scale) / 2;
  const currentGap = rightCenter - leftCenter - halfLeft - halfRight;
  const gapAdjust = (currentGap - gap) / 2;
  leftBase = clampManualOffset({
    ...leftBase,
    offsetX: leftBase.offsetX + gapAdjust,
  });
  rightBase = clampManualOffset({
    ...rightBase,
    offsetX: rightBase.offsetX - gapAdjust,
  });

  const leftUser = clampManualOffset(input.leftManual);
  const rightUser = clampManualOffset(input.rightManual);
  const leftManual = applyCompactBaseToUser(leftBase, leftUser);
  const rightManual = applyCompactBaseToUser(rightBase, rightUser);

  const finalLeft = SAME_SPACE_HOME_CENTER_X.left + leftManual.offsetX;
  const finalRight = SAME_SPACE_HOME_CENTER_X.right + rightManual.offsetX;
  const visualGap = finalRight - finalLeft - (leftW * leftManual.scale + rightW * rightManual.scale) / 2;

  const coupleBounds = {
    minX: Math.min(finalLeft - (leftW * leftManual.scale) / 2, finalRight - (rightW * rightManual.scale) / 2),
    maxX: Math.max(finalLeft + (leftW * leftManual.scale) / 2, finalRight + (rightW * rightManual.scale) / 2),
    minY: Math.min(input.leftBounds.minY, input.rightBounds.minY),
    maxY: Math.max(input.leftBounds.maxY, input.rightBounds.maxY),
  };

  return {
    leftTransform: leftManual,
    rightTransform: rightManual,
    leftBase,
    rightBase,
    coupleBounds,
    visualGap,
    groupWidthRatio: Math.max(0, coupleBounds.maxX - coupleBounds.minX),
    groupHeightRatio: Math.max(0, coupleBounds.maxY - coupleBounds.minY)
      * Math.max(leftManual.scale, rightManual.scale),
  };
}

/**
 * Convert a stored manual (possibly legacy baked auto) into pure user deltas
 * relative to the current packing base, marked manual.
 */
export function toUserTransformDelta(
  base: SameSpaceManualOffset,
  stored: SameSpaceManualOffset | null | undefined,
): SameSpaceManualOffset {
  const s = clampManualOffset(stored);
  if (s.mode === 'manual') {
    return clampManualOffset({ ...s, mode: 'manual' });
  }
  const isIdentity = Math.abs(s.offsetX) < 1e-6
    && Math.abs(s.offsetY) < 1e-6
    && Math.abs(s.scale - 1) < 1e-6;
  if (isIdentity) {
    return clampManualOffset({ offsetX: 0, offsetY: 0, scale: 1, mode: 'manual' });
  }
  // Legacy baked auto → decompose against packing base.
  return clampManualOffset({
    offsetX: s.offsetX - base.offsetX,
    offsetY: s.offsetY - base.offsetY,
    scale: s.scale / Math.max(0.05, base.scale),
    mode: 'manual',
  });
}

export function pullCoupleCloser(input: {
  left: SameSpaceManualOffset;
  right: SameSpaceManualOffset;
  leftBounds: SameSpacePersonBounds;
  rightBounds: SameSpacePersonBounds;
  targetGap?: number;
}): { left: SameSpaceManualOffset; right: SameSpaceManualOffset } {
  const targetGap = input.targetGap ?? -0.01;
  const leftW = boundsWidth(input.leftBounds) * input.left.scale;
  const rightW = boundsWidth(input.rightBounds) * input.right.scale;
  const leftCenter = SAME_SPACE_HOME_CENTER_X.left + input.left.offsetX;
  const rightCenter = SAME_SPACE_HOME_CENTER_X.right + input.right.offsetX;
  const currentGap = rightCenter - leftCenter - leftW / 2 - rightW / 2;
  if (!(currentGap > targetGap)) {
    return { left: input.left, right: input.right };
  }
  const adjust = (currentGap - targetGap) / 2;
  return {
    left: clampManualOffset({ ...input.left, offsetX: input.left.offsetX + adjust }),
    right: clampManualOffset({ ...input.right, offsetX: input.right.offsetX - adjust }),
  };
}
