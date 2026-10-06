import {
  DEFAULT_BOOTH_STAGE_TRANSFORM,
  type BoothStageNormalizedRect,
  type BoothStageTransform,
} from './coupleBoothStage';
import { getSceneFrameSpec, type BoothSceneSpanMode } from './boothSceneSpec';
import {
  SAME_SPACE_BASELINE_Y,
  SAME_SPACE_SAFE_INSET,
  SAME_SPACE_TARGET_PERSON_HEIGHT_RATIO,
  type SameSpaceCompositionSlot,
} from './sameSpaceLayoutSpec';

export type AutoAlignmentSubject = {
  participantId: string;
  slot: SameSpaceCompositionSlot;
  /** Current alpha-visible footprint in normalized stage coordinates. */
  visibleBounds: BoothStageNormalizedRect | null;
  /** Alpha bounds in normalized source-image coordinates, when available. */
  sourceVisibleBounds?: BoothStageNormalizedRect | null;
  sourceAspectRatio?: number | null;
  currentTransform?: BoothStageTransform | null;
};

/** Kept as the public observation name introduced by the V2 extension point. */
export type BoothAlignmentObservation = AutoAlignmentSubject;

export type BoothAlignmentTarget = {
  targetPersonHeight: number;
  baselineY: number;
  topMargin: number;
  minimumGap: number;
  maximumGap: number;
};

export type BoothAlignmentFallbackReason =
  | 'insufficient-subjects'
  | 'missing-bounds'
  | 'invalid-bounds'
  | 'unsafe-source-bounds'
  | 'unsafe-fit';

export type BoothAlignmentProposal = {
  participantId: string;
  slot: SameSpaceCompositionSlot;
  /** Proposed alpha-visible footprint; aspect ratio is preserved. */
  visibleBounds: BoothStageNormalizedRect;
  transform: BoothStageTransform;
  confidence: number;
  source: 'visible-bounds';
  /** The editor always remains authoritative after this proposal is applied. */
  requiresManualConfirmation: true;
};

export type BoothAutoAlignmentResult = {
  status: 'proposed' | 'fallback';
  proposals: BoothAlignmentProposal[];
  confidence: number;
  reason: 'aligned' | 'source-edge-cropped' | BoothAlignmentFallbackReason;
  metrics: {
    baselineY: number;
    targetPersonHeight: number;
    horizontalGap: number;
    pairCenterX: number;
    safeBounds: BoothStageNormalizedRect;
  } | null;
};

export type BoothAutoAlignmentStrategy = (input: {
  subjects: AutoAlignmentSubject[];
  spanMode: BoothSceneSpanMode;
  target?: BoothAlignmentTarget;
}) => BoothAutoAlignmentResult;

export const AUTO_ALIGN_MIN_VISIBLE_DIMENSION = 0.02;
export const AUTO_ALIGN_MIN_VISIBLE_AREA = 0.002;
export const AUTO_ALIGN_MIN_PERSON_HEIGHT = 0.38;
export const AUTO_ALIGN_MAX_PERSON_HEIGHT = 0.68;
export const AUTO_ALIGN_HEIGHT_DEAD_ZONE = 0.025;
export const AUTO_ALIGN_BASELINE_DEAD_ZONE = 0.015;
export const AUTO_ALIGN_SOURCE_EDGE_EPSILON = 0.015;
export const AUTO_ALIGN_SPAN_MARGIN = {
  one_cell: 0.015,
  two_cell: 0.025,
} as const;
export const AUTO_ALIGN_GAP_RANGE = {
  one_cell: { min: 0.012, max: 0.025 },
  two_cell: { min: 0.018, max: 0.045 },
} as const;

const DEFAULT_BASELINE_Y = SAME_SPACE_SAFE_INSET.y
  + SAME_SPACE_SAFE_INSET.height * SAME_SPACE_BASELINE_Y;

export const DEFAULT_BOOTH_ALIGNMENT_TARGET: BoothAlignmentTarget = {
  targetPersonHeight: SAME_SPACE_SAFE_INSET.height * SAME_SPACE_TARGET_PERSON_HEIGHT_RATIO,
  baselineY: DEFAULT_BASELINE_Y,
  topMargin: 0.03,
  minimumGap: AUTO_ALIGN_GAP_RANGE.two_cell.min,
  maximumGap: AUTO_ALIGN_GAP_RANGE.two_cell.max,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteRect(rect: BoothStageNormalizedRect | null | undefined): rect is BoothStageNormalizedRect {
  return Boolean(rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite));
}

export function isReliableAutoAlignmentRect(
  rect: BoothStageNormalizedRect | null | undefined,
): rect is BoothStageNormalizedRect {
  if (!finiteRect(rect)) return false;
  if (rect.width < AUTO_ALIGN_MIN_VISIBLE_DIMENSION || rect.height < AUTO_ALIGN_MIN_VISIBLE_DIMENSION) return false;
  if (rect.width * rect.height < AUTO_ALIGN_MIN_VISIBLE_AREA) return false;
  if (rect.width > 1.5 || rect.height > 1.5) return false;
  const visibleWidth = Math.max(0, Math.min(1, rect.x + rect.width) - Math.max(0, rect.x));
  const visibleHeight = Math.max(0, Math.min(1, rect.y + rect.height) - Math.max(0, rect.y));
  return visibleWidth / rect.width >= 0.5 && visibleHeight / rect.height >= 0.5;
}

function isSafeSourceBounds(rect: BoothStageNormalizedRect | null | undefined): boolean {
  if (rect == null) return true;
  if (!finiteRect(rect)) return false;
  return rect.x >= -0.02
    && rect.y >= -0.02
    && rect.x + rect.width <= 1.02
    && rect.y + rect.height <= 1.02
    && rect.width >= AUTO_ALIGN_MIN_VISIBLE_DIMENSION
    && rect.height >= AUTO_ALIGN_MIN_VISIBLE_DIMENSION
    && rect.width * rect.height >= AUTO_ALIGN_MIN_VISIBLE_AREA;
}

function sourceTouchesEdge(rect: BoothStageNormalizedRect | null | undefined): boolean {
  if (!rect) return false;
  return rect.x <= AUTO_ALIGN_SOURCE_EDGE_EPSILON
    || rect.y <= AUTO_ALIGN_SOURCE_EDGE_EPSILON
    || rect.x + rect.width >= 1 - AUTO_ALIGN_SOURCE_EDGE_EPSILON
    || rect.y + rect.height >= 1 - AUTO_ALIGN_SOURCE_EDGE_EPSILON;
}

function safeBoundsForSpanMode(spanMode: BoothSceneSpanMode): BoothStageNormalizedRect {
  const span = getSceneFrameSpec(spanMode).spanRect;
  const margin = AUTO_ALIGN_SPAN_MARGIN[spanMode];
  const left = Math.max(SAME_SPACE_SAFE_INSET.x, span.x + margin);
  const right = Math.min(
    SAME_SPACE_SAFE_INSET.x + SAME_SPACE_SAFE_INSET.width,
    span.x + span.width - margin,
  );
  return {
    x: left,
    y: SAME_SPACE_SAFE_INSET.y,
    width: Math.max(0, right - left),
    height: SAME_SPACE_SAFE_INSET.height,
  };
}

function fallback(reason: BoothAlignmentFallbackReason): BoothAutoAlignmentResult {
  return { status: 'fallback', proposals: [], confidence: 0, reason, metrics: null };
}

function targetHeightForSubjects(
  left: BoothStageNormalizedRect,
  right: BoothStageNormalizedRect,
  target: BoothAlignmentTarget,
): number {
  const average = (left.height + right.height) / 2;
  if (
    Math.abs(left.height - right.height) <= AUTO_ALIGN_HEIGHT_DEAD_ZONE
    && average >= AUTO_ALIGN_MIN_PERSON_HEIGHT
    && average <= AUTO_ALIGN_MAX_PERSON_HEIGHT
  ) {
    return average;
  }
  return clamp(target.targetPersonHeight, AUTO_ALIGN_MIN_PERSON_HEIGHT, AUTO_ALIGN_MAX_PERSON_HEIGHT);
}

function targetBaselineForSubjects(
  left: BoothStageNormalizedRect,
  right: BoothStageNormalizedRect,
  target: BoothAlignmentTarget,
): number {
  const leftBottom = left.y + left.height;
  const rightBottom = right.y + right.height;
  if (Math.abs(leftBottom - rightBottom) <= AUTO_ALIGN_BASELINE_DEAD_ZONE) {
    return clamp(
      (leftBottom + rightBottom) / 2,
      target.baselineY - AUTO_ALIGN_BASELINE_DEAD_ZONE,
      target.baselineY + AUTO_ALIGN_BASELINE_DEAD_ZONE,
    );
  }
  return target.baselineY;
}

/**
 * Deterministic editor-time alignment from stable captured alpha-visible bounds.
 * It never mutates inputs and never extrapolates missing body parts.
 */
export function proposeBoothAutoAlignment(input: {
  subjects: AutoAlignmentSubject[];
  spanMode: BoothSceneSpanMode;
  target?: BoothAlignmentTarget;
}): BoothAutoAlignmentResult {
  if (input.subjects.length < 2) return fallback('insufficient-subjects');
  const leftSubject = input.subjects.find((subject) => subject.slot === 'left');
  const rightSubject = input.subjects.find((subject) => subject.slot === 'right');
  if (!leftSubject || !rightSubject) return fallback('insufficient-subjects');
  if (!leftSubject.visibleBounds || !rightSubject.visibleBounds) return fallback('missing-bounds');
  if (!isReliableAutoAlignmentRect(leftSubject.visibleBounds) || !isReliableAutoAlignmentRect(rightSubject.visibleBounds)) {
    return fallback('invalid-bounds');
  }
  if (!isSafeSourceBounds(leftSubject.sourceVisibleBounds) || !isSafeSourceBounds(rightSubject.sourceVisibleBounds)) {
    return fallback('unsafe-source-bounds');
  }

  const left = leftSubject.visibleBounds;
  const right = rightSubject.visibleBounds;
  const leftAspect = left.width / left.height;
  const rightAspect = right.width / right.height;
  if (
    !Number.isFinite(leftAspect)
    || !Number.isFinite(rightAspect)
    || leftAspect < 0.08
    || rightAspect < 0.08
    || leftAspect > 1.4
    || rightAspect > 1.4
  ) {
    return fallback('invalid-bounds');
  }

  const gapRange = AUTO_ALIGN_GAP_RANGE[input.spanMode];
  const supplied = input.target ?? DEFAULT_BOOTH_ALIGNMENT_TARGET;
  const target: BoothAlignmentTarget = {
    ...supplied,
    minimumGap: clamp(supplied.minimumGap, gapRange.min, gapRange.max),
    maximumGap: clamp(supplied.maximumGap, gapRange.min, gapRange.max),
  };
  const safe = safeBoundsForSpanMode(input.spanMode);
  const baselineY = targetBaselineForSubjects(left, right, target);
  const maximumHeightForHeadroom = baselineY - (safe.y + target.topMargin);
  let personHeight = Math.min(
    targetHeightForSubjects(left, right, target),
    maximumHeightForHeadroom,
    AUTO_ALIGN_MAX_PERSON_HEIGHT,
  );

  const initialLeftWidth = personHeight * leftAspect;
  const initialRightWidth = personHeight * rightAspect;
  let gap = clamp(
    Math.min(initialLeftWidth, initialRightWidth) * 0.08,
    target.minimumGap,
    target.maximumGap,
  );
  const requiredWidth = initialLeftWidth + gap + initialRightWidth;
  if (requiredWidth > safe.width) {
    personHeight *= (safe.width - gap) / Math.max(0.001, initialLeftWidth + initialRightWidth);
  }
  if (!Number.isFinite(personHeight) || personHeight < AUTO_ALIGN_MIN_PERSON_HEIGHT) {
    return fallback('unsafe-fit');
  }

  const leftWidth = personHeight * leftAspect;
  const rightWidth = personHeight * rightAspect;
  gap = clamp(
    Math.min(leftWidth, rightWidth) * 0.08,
    target.minimumGap,
    target.maximumGap,
  );
  const pairWidth = leftWidth + gap + rightWidth;
  if (pairWidth > safe.width + 1e-9) return fallback('unsafe-fit');

  const pairStartX = safe.x + (safe.width - pairWidth) / 2;
  const top = baselineY - personHeight;
  if (top < safe.y + target.topMargin - 1e-9 || baselineY > safe.y + safe.height + 1e-9) {
    return fallback('unsafe-fit');
  }

  const leftRect = { x: pairStartX, y: top, width: leftWidth, height: personHeight };
  const rightRect = {
    x: pairStartX + leftWidth + gap,
    y: top,
    width: rightWidth,
    height: personHeight,
  };
  const edgeCropped = sourceTouchesEdge(leftSubject.sourceVisibleBounds)
    || sourceTouchesEdge(rightSubject.sourceVisibleBounds);
  const confidence = edgeCropped ? 0.72 : 0.92;

  const proposalFor = (
    subject: AutoAlignmentSubject,
    current: BoothStageNormalizedRect,
    proposed: BoothStageNormalizedRect,
  ): BoothAlignmentProposal => ({
    participantId: subject.participantId,
    slot: subject.slot,
    visibleBounds: proposed,
    transform: {
      ...(subject.currentTransform ?? DEFAULT_BOOTH_STAGE_TRANSFORM),
      x: proposed.x + proposed.width / 2,
      y: proposed.y + proposed.height / 2,
      scale: proposed.height / current.height,
    },
    confidence,
    source: 'visible-bounds',
    requiresManualConfirmation: true,
  });

  return {
    status: 'proposed',
    proposals: [
      proposalFor(leftSubject, left, leftRect),
      proposalFor(rightSubject, right, rightRect),
    ],
    confidence,
    reason: edgeCropped ? 'source-edge-cropped' : 'aligned',
    metrics: {
      baselineY,
      targetPersonHeight: personHeight,
      horizontalGap: gap,
      pairCenterX: pairStartX + pairWidth / 2,
      safeBounds: safe,
    },
  };
}

/** Optional strategy hook retained for future V1.1 experimentation. */
export function runOptionalBoothAutoAlignment(
  strategy: BoothAutoAlignmentStrategy | null | undefined,
  subjects: AutoAlignmentSubject[],
  spanMode: BoothSceneSpanMode,
  target: BoothAlignmentTarget = DEFAULT_BOOTH_ALIGNMENT_TARGET,
): BoothAutoAlignmentResult {
  return (strategy ?? proposeBoothAutoAlignment)({ subjects, spanMode, target });
}
