/**
 * Soft shared-stage layout for Same Space.
 * Anchors are homes; envelopes are soft motion guides — never hard clips.
 */

export type SameSpaceCompositionSlot = 'left' | 'right';

export type SameSpaceSoloLayout = 'half' | 'center';

export type SameSpaceFrontPreference = SameSpaceCompositionSlot;

export type SameSpaceManualOffset = {
  offsetX: number;
  offsetY: number;
  scale: number;
  /** auto: compact/base may refine; manual: user edits win. */
  mode?: 'auto' | 'manual';
};

/** Soft home guides (not clip regions). */
export const SAME_SPACE_HOME_REGIONS = {
  left: { x: 0, y: 0, width: 0.5, height: 1 },
  right: { x: 0.5, y: 0, width: 0.5, height: 1 },
} as const;

/** Default person centers — tight couple packing (~1–3% visual gap). */
export const SAME_SPACE_HOME_CENTER_X = {
  left: 0.43,
  right: 0.57,
} as const;

export const SAME_SPACE_HEADROOM_RATIO = 0.09;
/** Target visible person height as a fraction of the composition span height. */
export const SAME_SPACE_TARGET_PERSON_HEIGHT_RATIO = 0.70;
export const SAME_SPACE_MAX_PERSON_WIDTH_RATIO = 0.72;

/** Shared foot baseline (normalized stage Y of feet). */
export const SAME_SPACE_BASELINE_Y = 0.88;

/**
 * Soft motion mapping ranges (not clip walls). Automatic centroid motion
 * stays small; manual drag may still cross the midline.
 */
export const SAME_SPACE_MOTION_ENVELOPE = {
  left: { min: 0.10, max: 0.68 },
  right: { min: 0.32, max: 0.90 },
} as const;

export const SAME_SPACE_OVERLAP_CORRIDOR = {
  minX: 0.40,
  maxX: 0.60,
} as const;

export const SAME_SPACE_SAFE_INSET = {
  x: 0.04,
  y: 0.05,
  width: 0.92,
  height: 0.90,
} as const;

/** Stage escape clamp — keep some pixels visible. */
export const SAME_SPACE_CENTER_CLAMP = {
  min: 0.04,
  max: 0.96,
} as const;

/**
 * Automatic centroid contribution as a fraction of stage width.
 * Camera-internal motion already moves the person inside the sprite —
 * this is only a mild shared-stage assist (≈3–8%).
 */
export const SAME_SPACE_CENTROID_ASSIST_MAX = 0.06;
export const SAME_SPACE_MOTION_DEADZONE = 0.05;
export const SAME_SPACE_MOTION_SMOOTH = 0.18;
/** Shrink person slightly when bbox hugs the camera frame edge. */
export const SAME_SPACE_EDGE_SCALE_DAMP = 0.92;
export const SAME_SPACE_EDGE_TOUCH_EPS = 0.02;

/** Live / protocol transform nudge (separate from Review editor scale). */
export const SAME_SPACE_TRANSFORM_CLAMP = {
  x: 1,
  y: 1,
  scaleMin: 0.6,
  scaleMax: 1.6,
} as const;

/** Review / live editor subject scale — uniform, aspect-preserving. */
export const SAME_SPACE_MANUAL_SCALE_CLAMP = {
  scaleMin: 0.2,
  scaleMax: 5,
} as const;

export const SAME_SPACE_MANUAL_OFFSET_CLAMP = {
  /** Allow dragging toward the frame edge while keeping some pixels visible. */
  x: 0.48,
  y: 0.35,
} as const;

export const DEFAULT_SAME_SPACE_SOLO_LAYOUT: SameSpaceSoloLayout = 'half';
export const DEFAULT_SAME_SPACE_FRONT: SameSpaceFrontPreference = 'left';
export const DEFAULT_SAME_SPACE_MANUAL_OFFSET: SameSpaceManualOffset = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  mode: 'auto',
};

export function compareUserIdsCanonical(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function compositionSlotForUserId(
  userId: string,
  memberUserIdA: string,
  memberUserIdB: string,
): SameSpaceCompositionSlot | null {
  if (!userId || !memberUserIdA || !memberUserIdB || memberUserIdA === memberUserIdB) return null;
  if (userId !== memberUserIdA && userId !== memberUserIdB) return null;
  const leftId = compareUserIdsCanonical(memberUserIdA, memberUserIdB) <= 0
    ? memberUserIdA
    : memberUserIdB;
  return userId === leftId ? 'left' : 'right';
}

export function resolveSessionParticipantSlots(input: {
  localUserId: string;
  hostUserId: string;
  guestUserId: string;
  leftParticipantId?: string | null;
  rightParticipantId?: string | null;
}): {
  leftUserId: string;
  rightUserId: string;
  localSlot: SameSpaceCompositionSlot | null;
} {
  const { hostUserId, guestUserId, localUserId } = input;
  const left = input.leftParticipantId;
  const right = input.rightParticipantId;
  const validAssignment = Boolean(
    left
    && right
    && left !== right
    && ((left === hostUserId && right === guestUserId)
      || (left === guestUserId && right === hostUserId)),
  );
  const leftUserId = validAssignment
    ? left!
    : (compareUserIdsCanonical(hostUserId, guestUserId) <= 0 ? hostUserId : guestUserId);
  const rightUserId = leftUserId === hostUserId ? guestUserId : hostUserId;
  const localSlot = localUserId === leftUserId
    ? 'left'
    : localUserId === rightUserId
      ? 'right'
      : null;
  return { leftUserId, rightUserId, localSlot };
}

export function partnerUserIdForSlotMembers(
  localUserId: string,
  memberUserIdA: string,
  memberUserIdB: string,
): string | null {
  if (localUserId === memberUserIdA) return memberUserIdB;
  if (localUserId === memberUserIdB) return memberUserIdA;
  return null;
}

export function clampSameSpaceTransform(input: {
  x?: number;
  y?: number;
  scale?: number;
}): { x: number; y: number; scale: number } {
  const { x: maxX, y: maxY, scaleMin, scaleMax } = SAME_SPACE_TRANSFORM_CLAMP;
  return {
    x: Math.min(maxX, Math.max(-maxX, Number.isFinite(input.x) ? Number(input.x) : 0)),
    y: Math.min(maxY, Math.max(-maxY, Number.isFinite(input.y) ? Number(input.y) : 0)),
    scale: Math.min(
      scaleMax,
      Math.max(scaleMin, Number.isFinite(input.scale) ? Number(input.scale) : 1),
    ),
  };
}

export function clampManualOffset(input: Partial<SameSpaceManualOffset> | null | undefined): SameSpaceManualOffset {
  const { x: maxX, y: maxY } = SAME_SPACE_MANUAL_OFFSET_CLAMP;
  const { scaleMin, scaleMax } = SAME_SPACE_MANUAL_SCALE_CLAMP;
  return {
    offsetX: Math.min(maxX, Math.max(-maxX, Number.isFinite(input?.offsetX) ? Number(input!.offsetX) : 0)),
    offsetY: Math.min(maxY, Math.max(-maxY, Number.isFinite(input?.offsetY) ? Number(input!.offsetY) : 0)),
    scale: Math.min(
      scaleMax,
      Math.max(scaleMin, Number.isFinite(input?.scale) ? Number(input!.scale) : 1),
    ),
    mode: input?.mode === 'manual' ? 'manual' : 'auto',
  };
}

export function parseParticipantTransforms(
  raw: unknown,
): Record<string, SameSpaceManualOffset> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, SameSpaceManualOffset> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    out[key] = clampManualOffset({
      offsetX: Number(row.offsetX ?? row.offset_x ?? 0),
      offsetY: Number(row.offsetY ?? row.offset_y ?? 0),
      scale: Number(row.scale ?? 1),
      mode: row.mode === 'manual' ? 'manual' : 'auto',
    });
  }
  return out;
}

export type BoundsEdgeTouch = {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
};

export function detectBoundsEdgeTouch(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null | undefined,
  eps = SAME_SPACE_EDGE_TOUCH_EPS,
): BoundsEdgeTouch {
  if (!bounds) return { left: false, right: false, top: false, bottom: false };
  return {
    left: bounds.minX <= eps,
    right: bounds.maxX >= 1 - eps,
    top: bounds.minY <= eps,
    bottom: bounds.maxY >= 1 - eps,
  };
}

/**
 * Mild automatic assist from mask centroid. Does NOT re-map the person across
 * the whole stage — camera-internal motion already lives inside the sprite.
 */
export function computeDampedCentroidAssistX(
  slot: SameSpaceCompositionSlot,
  centroidXNorm: number | null | undefined,
  mirrorDisplay = false,
  edgeTouch?: BoundsEdgeTouch | null,
): number {
  if (typeof centroidXNorm !== 'number' || !Number.isFinite(centroidXNorm)) return 0;
  let delta = centroidXNorm - 0.5;
  if (mirrorDisplay) delta = -delta;
  if (Math.abs(delta) < SAME_SPACE_MOTION_DEADZONE) return 0;
  const signed = delta - Math.sign(delta) * SAME_SPACE_MOTION_DEADZONE;
  let assist = Math.max(-1, Math.min(1, signed / 0.45)) * SAME_SPACE_CENTROID_ASSIST_MAX;
  // Toward stage center for left is +X; for right is -X.
  if (edgeTouch) {
    if (assist > 0 && ((slot === 'left' && edgeTouch.right) || (slot === 'right' && edgeTouch.left))) {
      assist = 0;
    }
    if (assist < 0 && ((slot === 'left' && edgeTouch.left) || (slot === 'right' && edgeTouch.right))) {
      assist = 0;
    }
  }
  return assist;
}

/** @deprecated Prefer computeDampedCentroidAssistX. */
export function computeSameSpaceMotionOffsetX(
  centroidXNorm: number | null | undefined,
  _sensitivity?: number,
  deadzone = SAME_SPACE_MOTION_DEADZONE,
): number {
  if (typeof centroidXNorm !== 'number' || !Number.isFinite(centroidXNorm)) return 0;
  const delta = centroidXNorm - 0.5;
  if (Math.abs(delta) < deadzone) return 0;
  const signed = delta - Math.sign(delta) * deadzone;
  return Math.max(-SAME_SPACE_CENTROID_ASSIST_MAX, Math.min(SAME_SPACE_CENTROID_ASSIST_MAX, signed * 0.25));
}

export function smoothMotionOffset(previous: number, next: number, alpha = SAME_SPACE_MOTION_SMOOTH): number {
  return previous * (1 - alpha) + next * alpha;
}

export function mapCentroidToStageCenterX(
  slot: SameSpaceCompositionSlot,
  centroidXNorm: number | null | undefined,
  mirrorDisplay = false,
  transformX = 0,
  manualOffsetX = 0,
  edgeTouch?: BoundsEdgeTouch | null,
): number {
  const home = SAME_SPACE_HOME_CENTER_X[slot];
  const assist = computeDampedCentroidAssistX(slot, centroidXNorm, mirrorDisplay, edgeTouch);
  const raw = home + transformX * 0.04 + manualOffsetX + assist;
  return Math.min(SAME_SPACE_CENTER_CLAMP.max, Math.max(SAME_SPACE_CENTER_CLAMP.min, raw));
}

export function resolvePersonCenterX(
  slot: SameSpaceCompositionSlot,
  transformX: number,
  soloLayout: SameSpaceSoloLayout = 'half',
  participantCount = 2,
  motionOffsetX = 0,
  homeOverride?: number,
): number {
  if (participantCount < 2 && soloLayout === 'center') {
    return 0.5 + transformX * 0.08 + motionOffsetX;
  }
  const home = Number.isFinite(homeOverride) ? Number(homeOverride) : SAME_SPACE_HOME_CENTER_X[slot];
  return Math.min(
    SAME_SPACE_CENTER_CLAMP.max,
    Math.max(SAME_SPACE_CENTER_CLAMP.min, home + transformX * 0.04 + motionOffsetX),
  );
}

export function orderedDrawSlots(
  front: SameSpaceFrontPreference = DEFAULT_SAME_SPACE_FRONT,
): SameSpaceCompositionSlot[] {
  return front === 'right' ? ['left', 'right'] : ['right', 'left'];
}

export function destinationCrossesMidline(dest: { x: number; width: number }, canvasWidth: number): boolean {
  const mid = canvasWidth / 2;
  return dest.x < mid && dest.x + dest.width > mid;
}
