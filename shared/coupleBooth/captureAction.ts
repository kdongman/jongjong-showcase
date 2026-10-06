import { canStartCapture, type CaptureReadyBarrierInput } from './readyBarrier';

export type CaptureAutoStartPlan = {
  /** Host starts the authoritative 90s capture clock. */
  startClock: boolean;
  /**
   * Shots must never auto-schedule when the camera stage opens.
   * Every shot requires an explicit host capture action.
   */
  scheduleShot: boolean;
};

/**
 * After both participants are media-ready, only the host may start the
 * capture clock. Opening the camera stage must not schedule shot 1.
 */
export function planCaptureAutoStart(input: CaptureReadyBarrierInput): CaptureAutoStartPlan {
  return {
    startClock: canStartCapture(input),
    scheduleShot: false,
  };
}

export function canScheduleManualShot(input: {
  isHost: boolean;
  partnerConnected: boolean;
  bothReady: boolean;
  clockActive: boolean;
  startInFlight: boolean;
  captureBusy: boolean;
  pendingCaptureAt: string | null | undefined;
  canScheduleNext: boolean;
}): boolean {
  if (!input.isHost || !input.partnerConnected || !input.bothReady) return false;
  if (!input.clockActive || input.startInFlight || input.captureBusy) return false;
  if (!input.canScheduleNext) return false;
  if (input.pendingCaptureAt && Date.parse(input.pendingCaptureAt) > Date.now()) return false;
  return true;
}
