import type { SameSpaceNormalizedRect } from './sameSpaceStageLayout';
import {
  getSceneFrameSpec,
  type BoothSceneSpanMode,
  LEGACY_BOOTH_SCENE_SPAN_MODE,
} from './boothSceneSpec';
import {
  SAME_SPACE_BASELINE_Y,
  SAME_SPACE_EDGE_SCALE_DAMP,
  SAME_SPACE_HEADROOM_RATIO,
  SAME_SPACE_HOME_CENTER_X,
  SAME_SPACE_HOME_REGIONS,
  SAME_SPACE_MAX_PERSON_WIDTH_RATIO,
  SAME_SPACE_SAFE_INSET,
  SAME_SPACE_TARGET_PERSON_HEIGHT_RATIO,
  clampManualOffset,
  clampSameSpaceTransform,
  detectBoundsEdgeTouch,
  resolvePersonCenterX,
  type SameSpaceCompositionSlot,
  type SameSpaceManualOffset,
  type SameSpaceSoloLayout,
} from './sameSpaceLayoutSpec';

/** @deprecated Prefer SameSpaceCompositionSlot — kept for older call sites. */
export type SameSpacePersonRole = SameSpaceCompositionSlot | 'host' | 'guest';

/** Person bounds in normalized source coordinates (0–1, unmirrored). */
export type SameSpacePersonBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type SameSpaceNormalizedTransform = {
  x: number;
  y: number;
  scale: number;
};

export const DEFAULT_SAME_SPACE_TRANSFORM: SameSpaceNormalizedTransform = {
  x: 0,
  y: 0,
  scale: 1,
};

export type SameSpacePersonPlacement = {
  /** Always the full source frame — never a tight bbox crop of the FG canvas. */
  sourceCrop: { x: number; y: number; width: number; height: number };
  dest: { x: number; y: number; width: number; height: number };
  scale: number;
  anchor: { x: number; y: number };
  clippingSafeArea: SameSpaceNormalizedRect;
  slot: SameSpaceCompositionSlot;
  /** @deprecated Use slot. */
  role: SameSpaceCompositionSlot;
  /** Which boundary (if any) constrained the sprite. */
  clipBoundary: 'none' | 'stage-outer' | 'source-edge-damped';
  edgeTouch: { left: boolean; right: boolean; top: boolean; bottom: boolean };
  /** Visible person footprint on stage (bbox mapped into dest). */
  personDest: { x: number; y: number; width: number; height: number };
};

const MIN_BOUNDS_AREA = 0.01;
const BOTTOM_Y_NORM = SAME_SPACE_BASELINE_Y;

export function defaultPersonBounds(): SameSpacePersonBounds {
  return { minX: 0.15, minY: 0.05, maxX: 0.85, maxY: 0.98 };
}

export function isValidPersonBounds(bounds: SameSpacePersonBounds | null | undefined): boolean {
  if (!bounds) return false;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (!(width > 0) || !(height > 0)) return false;
  if (width * height < MIN_BOUNDS_AREA) return false;
  if (bounds.minX < -0.05 || bounds.minY < -0.05 || bounds.maxX > 1.05 || bounds.maxY > 1.05) return false;
  return true;
}

export function smoothPersonBounds(
  previous: SameSpacePersonBounds | null,
  next: SameSpacePersonBounds,
  alpha = 0.28,
): SameSpacePersonBounds {
  if (!previous) return next;
  const mix = (a: number, b: number) => a * (1 - alpha) + b * alpha;
  return {
    minX: mix(previous.minX, next.minX),
    minY: mix(previous.minY, next.minY),
    maxX: mix(previous.maxX, next.maxX),
    maxY: mix(previous.maxY, next.maxY),
  };
}

/** Map legacy host/guest labels onto composition slots when callers have not migrated. */
export function normalizeCompositionSlot(
  roleOrSlot: SameSpacePersonRole | SameSpaceCompositionSlot | null | undefined,
): SameSpaceCompositionSlot {
  if (roleOrSlot === 'right' || roleOrSlot === 'guest') return 'right';
  return 'left';
}

/**
 * Place a masked person as a full-frame transparent sprite.
 * Alpha bbox drives scale + foot anchor only — it never crops the FG canvas.
 *
 * finalCenterX = assignedAnchorX + manualOffsetX + dampedCentroidAssistX
 *
 * Live capture, Review preview, and final export all call this (or the
 * calculateSubjectDrawRect alias) with the same frame width/height for the
 * active sceneSpanMode so normalized transforms mean the same thing everywhere.
 */
export function computeSameSpacePersonPlacement(input: {
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  personBounds?: SameSpacePersonBounds | null;
  /**
   * When set, fit scale uses this person height instead of live bbox height.
   * Live Same Space locks this after stabilization so mask noise cannot zoom the body.
   */
  fitPersonHeightNorm?: number | null;
  /** When true, skip edge-touch scale damp (used after fit scale is locked). */
  disableEdgeScaleDamp?: boolean;
  normalizedTransform?: SameSpaceNormalizedTransform | null;
  manualOffset?: SameSpaceManualOffset | null;
  /** Extra normalized stage X from damped centroid assist (not full remapping). */
  motionOffsetX?: number;
  slot?: SameSpaceCompositionSlot;
  role?: SameSpacePersonRole;
  soloLayout?: SameSpaceSoloLayout;
  participantCount?: number;
  /** Drives composition span corridor (external frame stays 4:3). */
  spanMode?: BoothSceneSpanMode;
  template?: 'classic-pair';
}): SameSpacePersonPlacement {
  void input.template;
  const slot = input.slot ?? normalizeCompositionSlot(input.role);
  const spanMode = input.spanMode ?? LEGACY_BOOTH_SCENE_SPAN_MODE;
  const frameSpec = getSceneFrameSpec(spanMode);
  const transform = clampSameSpaceTransform(input.normalizedTransform ?? DEFAULT_SAME_SPACE_TRANSFORM);
  const manual = clampManualOffset(input.manualOffset);
  const bounds = isValidPersonBounds(input.personBounds) ? input.personBounds! : defaultPersonBounds();
  const edgeTouch = detectBoundsEdgeTouch(bounds);
  const participantCount = Math.max(1, input.participantCount ?? 2);
  const soloLayout = input.soloLayout ?? 'half';

  const sourceWidth = Math.max(1, input.sourceWidth);
  const sourceHeight = Math.max(1, input.sourceHeight);

  // Full-frame source — compositor draws the entire stable FG canvas.
  const sourceCrop = {
    x: 0,
    y: 0,
    width: sourceWidth,
    height: sourceHeight,
  };

  const safe = SAME_SPACE_SAFE_INSET;
  const safePixel = {
    x: safe.x * input.canvasWidth,
    y: safe.y * input.canvasHeight,
    width: safe.width * input.canvasWidth,
    height: safe.height * input.canvasHeight,
  };

  // Span corridor in canvas pixels — one_cell packs into ~half width, two_cell full.
  const spanPixel = {
    x: frameSpec.spanRect.x * input.canvasWidth,
    y: frameSpec.spanRect.y * input.canvasHeight,
    width: frameSpec.spanRect.width * input.canvasWidth,
    height: frameSpec.spanRect.height * input.canvasHeight,
  };

  const homeX = spanMode === 'one_cell'
    ? (slot === 'left'
      ? frameSpec.spanRect.x + frameSpec.spanRect.width * 0.38
      : frameSpec.spanRect.x + frameSpec.spanRect.width * 0.62)
    : SAME_SPACE_HOME_CENTER_X[slot];

  const centerXNorm = resolvePersonCenterX(
    slot,
    transform.x,
    soloLayout,
    participantCount,
    (input.motionOffsetX ?? 0) + manual.offsetX,
    homeX,
  );

  // finalScale = basePlacementScale * userTransform.scale
  // base is SAME_SPACE_TARGET_PERSON_HEIGHT_RATIO; user is manual.scale.
  let userScale = transform.scale * manual.scale;
  if (
    manual.mode !== 'manual'
    && !input.disableEdgeScaleDamp
    && (edgeTouch.left || edgeTouch.right || edgeTouch.top || edgeTouch.bottom)
  ) {
    userScale *= SAME_SPACE_EDGE_SCALE_DAMP;
  }

  const livePersonHeightNorm = Math.max(0.05, bounds.maxY - bounds.minY);
  const personHeightNorm = Math.max(
    0.05,
    Number.isFinite(input.fitPersonHeightNorm) && (input.fitPersonHeightNorm as number) > 0
      ? Number(input.fitPersonHeightNorm)
      : livePersonHeightNorm,
  );
  const personWidthNorm = Math.max(0.05, bounds.maxX - bounds.minX);
  const targetPersonHeight = safePixel.height * SAME_SPACE_TARGET_PERSON_HEIGHT_RATIO * userScale;
  // Scale so the alpha person height maps to target — full frame scales with it.
  let scale = targetPersonHeight / (personHeightNorm * sourceHeight);
  let destHeight = sourceHeight * scale;
  let destWidth = sourceWidth * scale;
  // Width clamp is relative to the composition span, not the full frame.
  const maxWidth = spanPixel.width * SAME_SPACE_MAX_PERSON_WIDTH_RATIO
    * (participantCount < 2 && soloLayout === 'center' ? 1.15 : 1);
  let footprintWidth = personWidthNorm * destWidth;
  if (footprintWidth > maxWidth) {
    const shrink = maxWidth / footprintWidth;
    scale *= shrink;
    destWidth *= shrink;
    destHeight *= shrink;
    footprintWidth = personWidthNorm * destWidth;
  }

  const bboxCenterX = (bounds.minX + bounds.maxX) / 2;
  const bboxBottomY = Math.min(1, bounds.maxY + livePersonHeightNorm * SAME_SPACE_HEADROOM_RATIO * 0.05);
  const anchorX = safePixel.x + safePixel.width * ((centerXNorm - safe.x) / Math.max(0.001, safe.width));
  // offsetY is normalized against full frame height (not the tiny 0.1 damp).
  const anchorBottom =
    safePixel.y
    + safePixel.height * BOTTOM_Y_NORM
    + (transform.y * 0.1 + manual.offsetY) * input.canvasHeight;

  // Align full-frame sprite so the person's bbox foot/center lands on the anchor.
  let destX = anchorX - bboxCenterX * destWidth;
  let destY = anchorBottom - bboxBottomY * destHeight;

  let clipBoundary: SameSpacePersonPlacement['clipBoundary'] = 'none';
  if (edgeTouch.left || edgeTouch.right || edgeTouch.top || edgeTouch.bottom) {
    clipBoundary = 'source-edge-damped';
  }

  // Soft outer clamp — stage outer only; never half-canvas walls.
  const minX = -destWidth * 0.4;
  const maxX = input.canvasWidth - destWidth * 0.6;
  const clampedX = Math.min(maxX, Math.max(minX, destX));
  if (clampedX !== destX) clipBoundary = 'stage-outer';
  destX = clampedX;
  destY = Math.min(input.canvasHeight - destHeight * 0.35, Math.max(-destHeight * 0.15, destY));

  const personDestWidth = personWidthNorm * destWidth;
  const personDestHeight = livePersonHeightNorm * destHeight;

  return {
    sourceCrop,
    dest: { x: destX, y: destY, width: destWidth, height: destHeight },
    scale,
    anchor: { x: anchorX, y: anchorBottom },
    clippingSafeArea: safe,
    slot,
    role: slot,
    clipBoundary,
    edgeTouch,
    /** Alpha person footprint on stage (not the full transparent sprite rect). */
    personDest: {
      x: destX + bounds.minX * destWidth,
      y: destY + bounds.minY * destHeight,
      width: personDestWidth,
      height: personDestHeight,
    },
  };
}

/** Alias for shared live/Review/export draw-rect calculation. */
export const calculateSubjectDrawRect = computeSameSpacePersonPlacement;

/** Home half rect for UI guides (not used as a hard clip). */
export function homeRegionForSlot(slot: SameSpaceCompositionSlot): SameSpaceNormalizedRect {
  return SAME_SPACE_HOME_REGIONS[slot];
}
