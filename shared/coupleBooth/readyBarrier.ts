export type CaptureReadyBarrierInput = {
  partnerConnected: boolean;
  localReady: boolean;
  remoteReady: boolean;
  isHost: boolean;
  captureStarted: boolean;
  startInFlight: boolean;
};

/**
 * The browser barrier gates the one host-authoritative start path.
 * Persisted session readiness is intentionally not part of this pre-capture
 * check because it can outlive a participant leave/rejoin lifecycle.
 */
export function canStartCapture(input: CaptureReadyBarrierInput): boolean {
  return (
    input.isHost
    && input.partnerConnected
    && input.localReady
    && input.remoteReady
    && !input.captureStarted
    && !input.startInFlight
  );
}

export function resetReadyBarrierOnParticipantLifecycle(
  connected: boolean,
  participantIdentity: string | null | undefined,
): { localReady: false; remoteReady: false } | null {
  if (!connected || !participantIdentity) {
    return { localReady: false, remoteReady: false };
  }
  return null;
}
