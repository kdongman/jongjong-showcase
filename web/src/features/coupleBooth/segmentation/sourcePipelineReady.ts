/**
 * Pure readiness checks for Same Space local/remote source pipelines.
 * Keeps host/guest/inviter roles out of pump identity — only local|remote.
 */

export type SameSpaceSourceId = 'local' | 'remote';

export type SourcePipelineReadiness = {
  ready: boolean;
  reason:
    | 'ready'
    | 'missing-video'
    | 'missing-track'
    | 'track-not-live'
    | 'not-attached'
    | 'video-not-ready'
    | 'zero-dimensions'
    | 'ended'
    | 'sid-mismatch';
};

/** True when an existing pump must stop so a new track SID can rebind. */
export function shouldRebindForTrackSidChange(input: {
  expectedTrackSid: string | null | undefined;
  pumpTrackSid: string | null | undefined;
}): boolean {
  return Boolean(
    input.expectedTrackSid
    && input.pumpTrackSid
    && input.expectedTrackSid !== input.pumpTrackSid,
  );
}

export type SourcePipelineIdentity = {
  sourceId: SameSpaceSourceId;
  trackSid: string | null;
  videoInstanceId: string | null;
};

export function evaluateSourcePipelineReadiness(input: {
  video: HTMLVideoElement | null;
  /** MediaStreamTrack.readyState when known. */
  mediaTrackReadyState: string | null | undefined;
  /** True when LiveKit track is attached to this exact element. */
  attachedToElement: boolean;
  /** Expected track sid for this pump, if any. */
  expectedTrackSid: string | null | undefined;
  /** Sid currently bound to the pump, if running. */
  pumpTrackSid: string | null | undefined;
  /** When true, a live MediaStreamTrack is required (remote). Local may allow preview. */
  requireLiveTrack: boolean;
}): SourcePipelineReadiness {
  if (!input.video) return { ready: false, reason: 'missing-video' };
  if (input.requireLiveTrack && !input.attachedToElement) {
    return { ready: false, reason: 'not-attached' };
  }
  if (input.requireLiveTrack && !input.mediaTrackReadyState) {
    return { ready: false, reason: 'missing-track' };
  }
  if (input.mediaTrackReadyState && input.mediaTrackReadyState !== 'live') {
    return { ready: false, reason: 'track-not-live' };
  }
  if (input.video.ended) return { ready: false, reason: 'ended' };
  if (input.video.readyState < 2 /* HAVE_CURRENT_DATA */) {
    return { ready: false, reason: 'video-not-ready' };
  }
  if (input.video.videoWidth <= 0 || input.video.videoHeight <= 0) {
    return { ready: false, reason: 'zero-dimensions' };
  }
  // SID mismatch is NOT a readiness failure. shouldReuseSourcePump returns false
  // so maybeStart can stop the old pump and rebind the new track SID.
  return { ready: true, reason: 'ready' };
}

/**
 * Whether an existing pump should be kept for the same video+sid.
 * Prevents duplicate pumps on StrictMode / repeated maybeStart calls.
 */
export function shouldReuseSourcePump(input: {
  running: boolean;
  cancelled: boolean;
  video: HTMLVideoElement | null;
  pumpVideo: HTMLVideoElement | null;
  trackSid: string | null | undefined;
  pumpTrackSid: string | null | undefined;
}): boolean {
  if (!input.running || input.cancelled) return false;
  if (!input.video || input.video !== input.pumpVideo) return false;
  if (input.trackSid && input.pumpTrackSid && input.trackSid !== input.pumpTrackSid) return false;
  return true;
}

/** Generation may only invalidate when identity truly changes. */
export function shouldInvalidatePumpGeneration(input: {
  previousTrackSid: string | null | undefined;
  nextTrackSid: string | null | undefined;
  previousVideo: HTMLVideoElement | null | undefined;
  nextVideo: HTMLVideoElement | null | undefined;
  unmounting: boolean;
}): boolean {
  if (input.unmounting) return true;
  if (input.previousVideo !== input.nextVideo) return true;
  if ((input.previousTrackSid ?? null) !== (input.nextTrackSid ?? null)) return true;
  return false;
}
