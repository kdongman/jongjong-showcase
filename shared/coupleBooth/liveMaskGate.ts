/**
 * Gate live segmentation masks so a single bad frame cannot horizontally
 * clip a head or flash the person transparent on the visible stage.
 */

export type MaskValiditySample = {
  areaRatio: number;
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  personPixels: number;
};

export type MaskGateState = {
  lastGood: MaskValiditySample | null;
  holdFrames: number;
};

export const MASK_GATE_MAX_HOLD_FRAMES = 5;
/** Reject if area collapses below this fraction of last good. */
export const MASK_GATE_AREA_COLLAPSE = 0.55;
/** Reject if top edge jumps more than this (normalized) in one frame. */
export const MASK_GATE_TOP_JUMP = 0.12;
/** Reject if bottom edge jumps more than this. */
export const MASK_GATE_BOTTOM_JUMP = 0.18;

export function createMaskGateState(): MaskGateState {
  return { lastGood: null, holdFrames: 0 };
}

export function sampleFromBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null | undefined,
  personPixels: number,
  frameArea: number,
): MaskValiditySample | null {
  if (!bounds) return null;
  const w = Math.max(0, bounds.maxX - bounds.minX);
  const h = Math.max(0, bounds.maxY - bounds.minY);
  if (!(w > 0) || !(h > 0)) return null;
  return {
    areaRatio: frameArea > 0 ? personPixels / frameArea : w * h,
    minY: bounds.minY,
    maxY: bounds.maxY,
    minX: bounds.minX,
    maxX: bounds.maxX,
    personPixels,
  };
}

/**
 * Returns true when the candidate mask should replace the committed FG.
 * Returns false to keep lastGoodMask for a few frames.
 */
export function shouldAcceptLiveMask(
  state: MaskGateState,
  candidate: MaskValiditySample | null,
): { accept: boolean; reason: string } {
  if (!candidate || candidate.personPixels < 40 || candidate.areaRatio < 0.01) {
    state.holdFrames += 1;
    return { accept: false, reason: 'empty-or-tiny' };
  }

  const prev = state.lastGood;
  if (!prev) {
    state.lastGood = candidate;
    state.holdFrames = 0;
    return { accept: true, reason: 'first-good' };
  }

  const areaCollapse = candidate.areaRatio < prev.areaRatio * MASK_GATE_AREA_COLLAPSE;
  const topJump = candidate.minY - prev.minY > MASK_GATE_TOP_JUMP;
  // Sudden top rise (head disappearing) while bottom stays — classic horizontal clip.
  const headChop = topJump && Math.abs(candidate.maxY - prev.maxY) < MASK_GATE_BOTTOM_JUMP;
  const bottomJump = Math.abs(candidate.maxY - prev.maxY) > MASK_GATE_BOTTOM_JUMP
    && candidate.areaRatio < prev.areaRatio * 0.75;

  if (areaCollapse || headChop || bottomJump) {
    state.holdFrames += 1;
    if (state.holdFrames > MASK_GATE_MAX_HOLD_FRAMES * 3) {
      // Person genuinely gone / moved — accept to avoid permanent freeze.
      state.lastGood = candidate;
      state.holdFrames = 0;
      return { accept: true, reason: 'hold-timeout-accept' };
    }
    return {
      accept: false,
      reason: areaCollapse ? 'area-collapse' : headChop ? 'head-chop' : 'bottom-jump',
    };
  }

  state.lastGood = candidate;
  state.holdFrames = 0;
  return { accept: true, reason: 'ok' };
}
