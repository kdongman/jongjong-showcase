export type BoothCaptureEvent = {
  /** Shared logical event ID (the existing protocol/database captureId). */
  eventId: string;
  shotIndex: number;
  /** Shared absolute wall-clock deadline. */
  captureAtMs: number;
};

export type CaptureEventClaim =
  | { accepted: true; event: BoothCaptureEvent }
  | { accepted: false; reason: 'invalid' | 'duplicate'; event: BoothCaptureEvent };

export function createBoothCaptureEvent(input: {
  captureId: string;
  shotIndex: number;
  captureAt: string | number;
}): BoothCaptureEvent {
  return {
    eventId: input.captureId,
    shotIndex: input.shotIndex,
    captureAtMs: typeof input.captureAt === 'number' ? input.captureAt : Date.parse(input.captureAt),
  };
}

/** Atomically claims a logical event for one local capture pipeline. */
export function claimBoothCaptureEvent(
  processedEventIds: Set<string>,
  event: BoothCaptureEvent,
): CaptureEventClaim {
  if (!event.eventId || !Number.isFinite(event.captureAtMs) || event.shotIndex < 1) {
    return { accepted: false, reason: 'invalid', event };
  }
  if (processedEventIds.has(event.eventId)) {
    return { accepted: false, reason: 'duplicate', event };
  }
  processedEventIds.add(event.eventId);
  return { accepted: true, event };
}

/** Measurable best-effort camera timing; zero is ideal but not guaranteed. */
export function captureTimingDeltaMs(event: BoothCaptureEvent, capturedAtMs: number): number {
  return capturedAtMs - event.captureAtMs;
}
