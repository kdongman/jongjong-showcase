/**
 * Per-source decoded-frame pump for Same Space.
 * Local and remote must never share callback IDs, generation, or last-frame markers.
 *
 * rVFC callback chains must never die on early returns or throws while running.
 * Always re-arm in `finally` unless the pump is stopped.
 *
 * Modes are exclusive: rvfc XOR rafFallback — never dual-enqueue the same tick.
 */

import type { SameSpaceSourceId } from './sourcePipelineReady';

export type { SameSpaceSourceId };

export type VideoFrameCallbackMetadataLike = {
  mediaTime?: number;
  presentedFrames?: number;
};

export type VideoFramePumpMode = 'idle' | 'waitingForVideo' | 'rvfc' | 'rafFallback' | 'stopped';

export type VideoFramePumpState = {
  sourceId: SameSpaceSourceId;
  video: HTMLVideoElement;
  generation: number;
  mode: VideoFramePumpMode;
  videoFrameCallbackId: number | null;
  animationFrameId: number | null;
  cancelled: boolean;
  lastMediaTime: number;
  lastPresentedFrames: number;
  lastVideoCurrentTime: number;
  lastFrameReceivedAt: number;
  lastRvfcAt: number;
  lastRafAt: number;
  rafFallbackActive: boolean;
  watchdogRecoveryCount: number;
  trackSid: string | null;
};

export type VideoFrameAcceptDecision = {
  accept: boolean;
  mediaTime: number;
  presentedFrames: number;
  reason:
    | 'presented-frames'
    | 'media-time'
    | 'video-current-time'
    | 'rvfc-new-frame'
    | 'raf-tick'
    | 'duplicate'
    | 'unusable';
};

type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameCallbackMetadataLike) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export type VideoFramePumpHandlers = {
  onFrame: (info: { mediaTime: number; presentedFrames: number; generation: number }) => void;
  onRvfcRegistered?: () => void;
  onRvfcFired?: () => void;
  onRafFired?: () => void;
  onRafFallbackEngaged?: () => void;
  onModeChange?: (mode: VideoFramePumpMode, reason: string) => void;
};

/** Silence window before engaging rAF instead of a stuck rVFC. */
export const VIDEO_FRAME_PUMP_RVFC_WATCHDOG_MS = 500;

let nextVideoInstanceSeq = 0;

/** Stable short id for a video element (debug HUD only — not a UUID). */
export function ensureVideoInstanceId(video: HTMLVideoElement): string {
  const key = '__sameSpaceVideoInstanceId';
  const existing = (video as HTMLVideoElement & { [key]?: string })[key];
  if (existing) return existing;
  const id = `v${++nextVideoInstanceSeq}`;
  (video as HTMLVideoElement & { [key]?: string })[key] = id;
  return id;
}

export function isVideoFrameUsable(video: HTMLVideoElement): boolean {
  return (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    && video.videoWidth > 0
    && video.videoHeight > 0
    && !video.ended
  );
}

/**
 * Pure watchdog decision — used by the live pump and unit tests.
 * Engage rAF when the element is usable but rVFC has been silent too long.
 */
export function shouldEngageRafFallback(input: {
  cancelled: boolean;
  usable: boolean;
  hasRvfcApi: boolean;
  rafFallbackActive: boolean;
  lastRvfcAt: number;
  now: number;
  watchdogMs?: number;
}): boolean {
  if (input.cancelled || !input.usable || input.rafFallbackActive) return false;
  if (!input.hasRvfcApi) return true;
  if (!(input.lastRvfcAt > 0)) {
    return input.now - (input.lastRvfcAt || 0) >= (input.watchdogMs ?? VIDEO_FRAME_PUMP_RVFC_WATCHDOG_MS);
  }
  return input.now - input.lastRvfcAt >= (input.watchdogMs ?? VIDEO_FRAME_PUMP_RVFC_WATCHDOG_MS);
}

/**
 * Decide whether a pump tick should enqueue work for the fair scheduler.
 * Pure — used by the live pump and unit tests.
 *
 * When `requireProgress` is true (remote WebRTC), never accept solely because
 * rVFC/rAF fired — that re-commits frozen decode as "new" frames (Class E).
 * Local may still accept rvfc-new-frame for streams whose mediaTime stays at 0.
 */
export function decideVideoFrameAccept(input: {
  usable: boolean;
  lastMediaTime: number;
  lastPresentedFrames: number;
  mediaTime: number | null | undefined;
  presentedFrames: number | null | undefined;
  rvfcDelivery: boolean;
  rafTick: boolean;
  /** Remote: require mediaTime / presentedFrames / video.currentTime progress. */
  requireProgress?: boolean;
  videoCurrentTime?: number | null;
  lastVideoCurrentTime?: number | null;
}): VideoFrameAcceptDecision {
  if (!input.usable) {
    return {
      accept: false,
      mediaTime: input.lastMediaTime,
      presentedFrames: input.lastPresentedFrames,
      reason: 'unusable',
    };
  }

  const hasPresented =
    typeof input.presentedFrames === 'number' && Number.isFinite(input.presentedFrames);
  const hasMediaTime =
    typeof input.mediaTime === 'number' && Number.isFinite(input.mediaTime);
  const hasCurrentTime =
    typeof input.videoCurrentTime === 'number' && Number.isFinite(input.videoCurrentTime);
  const lastCurrent = typeof input.lastVideoCurrentTime === 'number' && Number.isFinite(input.lastVideoCurrentTime)
    ? input.lastVideoCurrentTime
    : Number.NaN;
  const currentAdvanced = hasCurrentTime
    && Number.isFinite(lastCurrent)
    && Math.abs((input.videoCurrentTime as number) - lastCurrent) > 0.0005;

  if (hasPresented) {
    const presentedFrames = input.presentedFrames as number;
    if (presentedFrames !== input.lastPresentedFrames) {
      return {
        accept: true,
        mediaTime: hasMediaTime ? (input.mediaTime as number) : input.lastMediaTime,
        presentedFrames,
        reason: 'presented-frames',
      };
    }
    if (hasMediaTime && (input.mediaTime as number) !== input.lastMediaTime) {
      return {
        accept: true,
        mediaTime: input.mediaTime as number,
        presentedFrames,
        reason: 'media-time',
      };
    }
    if (currentAdvanced) {
      return {
        accept: true,
        mediaTime: hasMediaTime ? (input.mediaTime as number) : (input.videoCurrentTime as number),
        presentedFrames,
        reason: 'video-current-time',
      };
    }
    return {
      accept: false,
      mediaTime: input.lastMediaTime,
      presentedFrames: input.lastPresentedFrames,
      reason: 'duplicate',
    };
  }

  if (hasMediaTime) {
    const mediaTime = input.mediaTime as number;
    if (mediaTime !== input.lastMediaTime) {
      return {
        accept: true,
        mediaTime,
        presentedFrames: input.lastPresentedFrames,
        reason: 'media-time',
      };
    }
    if (currentAdvanced) {
      return {
        accept: true,
        mediaTime: input.videoCurrentTime as number,
        presentedFrames: input.lastPresentedFrames + 1,
        reason: 'video-current-time',
      };
    }
    if (!input.requireProgress && input.rvfcDelivery) {
      return {
        accept: true,
        mediaTime,
        presentedFrames: input.lastPresentedFrames + 1,
        reason: 'rvfc-new-frame',
      };
    }
    return {
      accept: false,
      mediaTime: input.lastMediaTime,
      presentedFrames: input.lastPresentedFrames,
      reason: 'duplicate',
    };
  }

  if (currentAdvanced) {
    return {
      accept: true,
      mediaTime: input.videoCurrentTime as number,
      presentedFrames: input.lastPresentedFrames + 1,
      reason: 'video-current-time',
    };
  }

  if (!input.requireProgress && input.rvfcDelivery) {
    return {
      accept: true,
      mediaTime: hasCurrentTime ? (input.videoCurrentTime as number) : input.lastMediaTime,
      presentedFrames: input.lastPresentedFrames + 1,
      reason: 'rvfc-new-frame',
    };
  }

  if (!input.requireProgress && input.rafTick) {
    return {
      accept: true,
      mediaTime: hasCurrentTime ? (input.videoCurrentTime as number) : input.lastMediaTime,
      presentedFrames: input.lastPresentedFrames + 1,
      reason: 'raf-tick',
    };
  }

  // Remote cold-start: allow the first enqueue before progress markers exist.
  if (
    input.requireProgress
    && !Number.isFinite(input.lastMediaTime)
    && input.lastPresentedFrames < 0
    && (input.rvfcDelivery || input.rafTick)
  ) {
    return {
      accept: true,
      mediaTime: hasCurrentTime ? (input.videoCurrentTime as number) : 0,
      presentedFrames: 0,
      reason: input.rvfcDelivery ? 'rvfc-new-frame' : 'raf-tick',
    };
  }

  return {
    accept: false,
    mediaTime: input.lastMediaTime,
    presentedFrames: input.lastPresentedFrames,
    reason: 'duplicate',
  };
}

export type StartVideoFramePumpOptions = {
  trackSid?: string | null;
};

export function startVideoFramePump(
  sourceId: SameSpaceSourceId,
  video: HTMLVideoElement,
  handlers: VideoFramePumpHandlers,
  options: StartVideoFramePumpOptions = {},
): { stop: () => void; state: VideoFramePumpState; rearm: (reason?: string) => void } {
  const frameVideo = video as FrameCallbackVideo;
  const hasRvfcApi = typeof frameVideo.requestVideoFrameCallback === 'function';
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const state: VideoFramePumpState = {
    sourceId,
    video,
    generation: 1,
    mode: 'idle',
    videoFrameCallbackId: null,
    animationFrameId: null,
    cancelled: false,
    lastMediaTime: Number.NaN,
    lastPresentedFrames: -1,
    lastVideoCurrentTime: Number.NaN,
    lastFrameReceivedAt: 0,
    lastRvfcAt: 0,
    lastRafAt: 0,
    rafFallbackActive: !hasRvfcApi,
    watchdogRecoveryCount: 0,
    trackSid: options.trackSid ?? null,
  };

  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const setMode = (mode: VideoFramePumpMode, reason: string) => {
    if (state.mode === mode) return;
    state.mode = mode;
    handlers.onModeChange?.(mode, reason);
  };

  const emitIfAccepted = (
    metadata: VideoFrameCallbackMetadataLike | null,
    flags: { rvfcDelivery: boolean; rafTick: boolean },
  ) => {
    if (state.cancelled) return;
    const generationAtStart = state.generation;
    const decision = decideVideoFrameAccept({
      usable: isVideoFrameUsable(video),
      lastMediaTime: state.lastMediaTime,
      lastPresentedFrames: state.lastPresentedFrames,
      mediaTime: metadata?.mediaTime,
      presentedFrames: metadata?.presentedFrames,
      rvfcDelivery: flags.rvfcDelivery,
      rafTick: flags.rafTick,
      requireProgress: sourceId === 'remote',
      videoCurrentTime: video.currentTime,
      lastVideoCurrentTime: state.lastVideoCurrentTime,
    });
    if (!decision.accept) return;
    if (state.cancelled || state.generation !== generationAtStart) return;
    state.lastMediaTime = decision.mediaTime;
    state.lastPresentedFrames = decision.presentedFrames;
    state.lastVideoCurrentTime = video.currentTime;
    state.lastFrameReceivedAt = nowMs();
    handlers.onFrame({
      mediaTime: decision.mediaTime,
      presentedFrames: decision.presentedFrames,
      generation: state.generation,
    });
  };

  const ensurePlaying = () => {
    if (video.paused && !video.ended) {
      void video.play().catch(() => undefined);
    }
  };

  let rearmQueued = false;
  const clearPendingCallbacks = () => {
    if (state.videoFrameCallbackId != null) {
      frameVideo.cancelVideoFrameCallback?.(state.videoFrameCallbackId);
      state.videoFrameCallbackId = null;
    }
    if (state.animationFrameId != null) {
      window.cancelAnimationFrame(state.animationFrameId);
      state.animationFrameId = null;
    }
  };

  const scheduleRvfc = () => {
    if (state.cancelled || !hasRvfcApi || state.rafFallbackActive) return;
    state.videoFrameCallbackId = frameVideo.requestVideoFrameCallback!(
      (_now, metadata) => {
        state.videoFrameCallbackId = null;
        try {
          if (state.cancelled) return;
          state.lastRvfcAt = nowMs();
          setMode('rvfc', 'rvfc-fired');
          handlers.onRvfcFired?.();
          emitIfAccepted(metadata ?? {}, { rvfcDelivery: true, rafTick: false });
        } catch {
          // Never let handler/scheduler errors kill the callback chain.
        } finally {
          if (!state.cancelled && !state.rafFallbackActive) scheduleRvfc();
        }
      },
    );
    handlers.onRvfcRegistered?.();
  };

  const scheduleRafWatchdog = () => {
    if (state.cancelled) return;
    state.animationFrameId = window.requestAnimationFrame(() => {
      state.animationFrameId = null;
      try {
        if (state.cancelled) return;
        state.lastRafAt = nowMs();
        handlers.onRafFired?.();

        if (
          shouldEngageRafFallback({
            cancelled: state.cancelled,
            usable: isVideoFrameUsable(video),
            hasRvfcApi,
            rafFallbackActive: state.rafFallbackActive,
            lastRvfcAt: state.lastRvfcAt || startedAt,
            now: nowMs(),
          })
        ) {
          state.rafFallbackActive = true;
          state.watchdogRecoveryCount += 1;
          if (state.videoFrameCallbackId != null) {
            frameVideo.cancelVideoFrameCallback?.(state.videoFrameCallbackId);
            state.videoFrameCallbackId = null;
          }
          setMode('rafFallback', 'watchdog-rvfc-stall');
          handlers.onRafFallbackEngaged?.();
        }

        if (state.rafFallbackActive || !hasRvfcApi) {
          setMode('rafFallback', 'raf-enqueue');
          emitIfAccepted(null, { rvfcDelivery: false, rafTick: true });
          // Periodically probe rVFC recovery without dual-enqueue: if a frame
          // arrives via rVFC, leave fallback and resume exclusive rVFC mode.
          if (
            hasRvfcApi
            && state.videoFrameCallbackId == null
            && nowMs() - (state.lastRvfcAt || startedAt) >= VIDEO_FRAME_PUMP_RVFC_WATCHDOG_MS
          ) {
            state.videoFrameCallbackId = frameVideo.requestVideoFrameCallback!(
              (_now, metadata) => {
                state.videoFrameCallbackId = null;
                try {
                  if (state.cancelled) return;
                  state.lastRvfcAt = nowMs();
                  state.rafFallbackActive = false;
                  setMode('rvfc', 'rvfc-recovered');
                  handlers.onRvfcFired?.();
                  emitIfAccepted(metadata ?? {}, { rvfcDelivery: true, rafTick: false });
                } catch {
                  /* ignore */
                } finally {
                  if (!state.cancelled && !state.rafFallbackActive) scheduleRvfc();
                }
              },
            );
            handlers.onRvfcRegistered?.();
          }
        } else if (!isVideoFrameUsable(video)) {
          setMode('waitingForVideo', 'waiting-dimensions');
        }
      } catch {
        /* keep chain alive */
      } finally {
        if (!state.cancelled) scheduleRafWatchdog();
      }
    });
  };

  const arm = (reason: string) => {
    if (state.cancelled) return;
    ensurePlaying();
    clearPendingCallbacks();
    if (!isVideoFrameUsable(video)) {
      setMode('waitingForVideo', reason);
    } else if (state.rafFallbackActive || !hasRvfcApi) {
      setMode('rafFallback', reason);
    } else {
      setMode('rvfc', reason);
    }
    if (hasRvfcApi && !state.rafFallbackActive) scheduleRvfc();
    scheduleRafWatchdog();
  };

  const requestRearm = (reason = 'media-event') => {
    if (state.cancelled || rearmQueued) return;
    rearmQueued = true;
    queueMicrotask(() => {
      rearmQueued = false;
      if (state.cancelled) return;
      state.rafFallbackActive = !hasRvfcApi;
      arm(reason);
    });
  };

  const onLoadedMetadata = () => requestRearm('loadedmetadata');
  const onLoadedData = () => requestRearm('loadeddata');
  const onCanPlay = () => requestRearm('canplay');
  const onPlaying = () => requestRearm('playing');
  const onResize = () => requestRearm('resize');

  arm('start');
  video.addEventListener('loadedmetadata', onLoadedMetadata);
  video.addEventListener('loadeddata', onLoadedData);
  video.addEventListener('canplay', onCanPlay);
  video.addEventListener('playing', onPlaying);
  video.addEventListener('resize', onResize);

  return {
    state,
    rearm: requestRearm,
    stop: () => {
      state.cancelled = true;
      state.generation += 1;
      setMode('stopped', 'stop');
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('resize', onResize);
      clearPendingCallbacks();
    },
  };
}
