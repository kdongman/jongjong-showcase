/**
 * Synchronized capture timing helpers.
 * Uses server wall-clock + local offset; never treats late schedules as camera failures.
 */

export const CAPTURE_GRACE_IMMEDIATE_MS = 400;
/** Capture immediately through this late window; beyond → recoverable miss. */
export const CAPTURE_GRACE_LATE_CAPTURE_MS = 1500;
export const CAPTURE_RAF_WINDOW_MS = 200;

export type CaptureScheduleDecision =
  | { action: 'wait'; delayMs: number }
  | { action: 'capture-now'; lateByMs: number }
  | { action: 'missed'; lateByMs: number };

export function decideCaptureScheduleTiming(input: {
  targetLocalMs: number;
  nowLocalMs: number;
}): CaptureScheduleDecision {
  const lateByMs = input.nowLocalMs - input.targetLocalMs;

  if (lateByMs <= 0) {
    return { action: 'wait', delayMs: Math.max(0, -lateByMs) };
  }
  // 0–1500ms late: still take the nearest compositor frame. Same-shot
  // server reschedule requires an RPC change (HOST_ONLY + sequence), so the
  // client recovers locally inside this window instead.
  if (lateByMs <= CAPTURE_GRACE_LATE_CAPTURE_MS) {
    return { action: 'capture-now', lateByMs };
  }
  return { action: 'missed', lateByMs };
}

export function isCaptureSyncErrorCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const normalized = code.trim().toUpperCase();
  return [
    'CAPTURE_SCHEDULE_MISSED',
    'CAPTURE_SCHEDULE_FAILED',
    'CAPTURE_ACK_TIMEOUT',
    'CLOCK_SYNC_INVALID',
    'PARTNER_CAPTURE_LATE',
    'INVALID_CAPTURE_SCHEDULE',
  ].some((item) => normalized === item || normalized.includes(item));
}

export function captureSyncUserCopy(code: string, recovering = false): { title: string; detail: string } {
  if (recovering || code === 'CAPTURE_SCHEDULE_MISSED') {
    return {
      title: recovering ? '촬영 타이밍을 다시 맞추고 있어요' : '촬영 타이밍을 맞추지 못했어요',
      detail: recovering
        ? '같은 컷을 다시 준비하고 있어요. 연결은 유지됩니다.'
        : '다시 촬영해 주세요. 카메라 연결은 그대로 유지됩니다.',
    };
  }
  return {
    title: '촬영 타이밍을 맞추지 못했어요',
    detail: '다시 촬영해 주세요. 카메라 연결은 그대로 유지됩니다.',
  };
}

/** Wait until local deadline using coarse timeout then rAF in the last 200ms. */
export function waitUntilLocalDeadline(
  targetLocalMs: number,
  options: {
    now?: () => number;
    setTimeoutFn?: (fn: () => void, ms: number) => number;
    raf?: (fn: FrameRequestCallback) => number;
    clearTimeoutFn?: (id: number) => void;
    cancelRaf?: (id: number) => void;
    onTick?: (remainingMs: number) => void;
    isCancelled?: () => boolean;
  } = {},
): Promise<'ready' | 'cancelled'> {
  const now = options.now ?? (() => Date.now());
  const setTimeoutFn = options.setTimeoutFn ?? ((fn, ms) => window.setTimeout(fn, ms));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((id) => window.clearTimeout(id));
  const raf = options.raf ?? ((fn) => window.requestAnimationFrame(fn));
  const cancelRaf = options.cancelRaf ?? ((id) => window.cancelAnimationFrame(id));

  return new Promise((resolve) => {
    let timeoutId: number | null = null;
    let rafId: number | null = null;

    const finish = (result: 'ready' | 'cancelled') => {
      if (timeoutId != null) clearTimeoutFn(timeoutId);
      if (rafId != null) cancelRaf(rafId);
      resolve(result);
    };

    const tick = () => {
      if (options.isCancelled?.()) {
        finish('cancelled');
        return;
      }
      const remaining = targetLocalMs - now();
      options.onTick?.(remaining);
      if (remaining <= 0) {
        finish('ready');
        return;
      }
      if (remaining > CAPTURE_RAF_WINDOW_MS) {
        timeoutId = setTimeoutFn(tick, Math.min(80, remaining - CAPTURE_RAF_WINDOW_MS));
        return;
      }
      rafId = raf(() => tick());
    };

    tick();
  });
}
