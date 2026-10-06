import {
  isValidPersonBounds,
  type SameSpacePersonBounds,
} from './sameSpaceComposition';

/**
 * Live Same Space fit-scale lock.
 * Bounding-box noise must not retarget body scale every segmentation frame.
 */

export type FitScaleLockState = {
  sampleCount: number;
  /** Height used for fit scale once locked (normalized 0–1). */
  lockedHeightNorm: number | null;
  /** Slow EMA of person height while unlocked / after large jumps. */
  emaHeightNorm: number | null;
  lastValidAtMs: number;
  missingSinceMs: number | null;
};

/** Consecutive valid masks before locking fit scale. */
export const FIT_SCALE_LOCK_SAMPLES = 12;
/** Ignore target-height deltas below this fraction once locked. */
export const FIT_SCALE_HYSTERESIS = 0.06;
/** Cap per-update EMA step when unlocked or after a large jump. */
export const FIT_SCALE_MAX_STEP = 0.025;
/** Person must be missing this long before fit scale re-initializes. */
export const FIT_SCALE_REACQUIRE_MS = 900;
export const FIT_SCALE_EMA_ALPHA = 0.12;

export function createFitScaleLockState(): FitScaleLockState {
  return {
    sampleCount: 0,
    lockedHeightNorm: null,
    emaHeightNorm: null,
    lastValidAtMs: 0,
    missingSinceMs: null,
  };
}

function personHeightNorm(bounds: SameSpacePersonBounds): number {
  return Math.max(0.05, bounds.maxY - bounds.minY);
}

/**
 * Advance fit-scale lock from a new mask sample.
 * Position tracking should keep using live smoothed bounds separately.
 */
export function updateFitScaleLock(
  previous: FitScaleLockState,
  bounds: SameSpacePersonBounds | null | undefined,
  nowMs: number,
): FitScaleLockState {
  if (!isValidPersonBounds(bounds)) {
    if (previous.missingSinceMs == null) {
      return { ...previous, missingSinceMs: nowMs };
    }
    if (nowMs - previous.missingSinceMs >= FIT_SCALE_REACQUIRE_MS) {
      return createFitScaleLockState();
    }
    return previous;
  }

  const height = personHeightNorm(bounds!);
  let ema = previous.emaHeightNorm;
  if (ema == null) {
    ema = height;
  } else {
    const raw = ema * (1 - FIT_SCALE_EMA_ALPHA) + height * FIT_SCALE_EMA_ALPHA;
    const maxDelta = Math.max(0.01, ema * FIT_SCALE_MAX_STEP);
    ema = Math.min(ema + maxDelta, Math.max(ema - maxDelta, raw));
  }

  const sampleCount = previous.lockedHeightNorm != null
    ? previous.sampleCount
    : previous.sampleCount + 1;

  let lockedHeightNorm = previous.lockedHeightNorm;
  if (lockedHeightNorm == null && sampleCount >= FIT_SCALE_LOCK_SAMPLES) {
    lockedHeightNorm = ema;
  } else if (lockedHeightNorm != null) {
    const delta = Math.abs(height - lockedHeightNorm) / lockedHeightNorm;
    // Only crawl the lock when the body truly changed size (step closer / farther).
    if (delta >= FIT_SCALE_HYSTERESIS) {
      const maxDelta = Math.max(0.01, lockedHeightNorm * FIT_SCALE_MAX_STEP);
      const nudged = lockedHeightNorm * (1 - FIT_SCALE_EMA_ALPHA) + height * FIT_SCALE_EMA_ALPHA;
      lockedHeightNorm = Math.min(
        lockedHeightNorm + maxDelta,
        Math.max(lockedHeightNorm - maxDelta, nudged),
      );
    }
  }

  return {
    sampleCount,
    lockedHeightNorm,
    emaHeightNorm: ema,
    lastValidAtMs: nowMs,
    missingSinceMs: null,
  };
}

/** Height norm used for fit scale — locked value preferred, else EMA, else live. */
export function resolveFitPersonHeightNorm(
  state: FitScaleLockState,
  liveBounds: SameSpacePersonBounds | null | undefined,
): number | null {
  if (state.lockedHeightNorm != null) return state.lockedHeightNorm;
  if (state.emaHeightNorm != null) return state.emaHeightNorm;
  if (isValidPersonBounds(liveBounds)) return personHeightNorm(liveBounds!);
  return null;
}
