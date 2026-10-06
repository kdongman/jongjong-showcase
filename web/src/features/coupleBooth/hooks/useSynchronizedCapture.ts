import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { COUPLE_BOOTH_PROTOCOL_VERSION, TOTAL_SHOTS } from '@shared/types';
import type { BoothRealtimeEvent } from '@shared/protocol';
import { protocolsCompatible } from '@shared/protocol';
import { validateUploadIdempotency } from '@shared/validation';
import { poseForShot } from '@shared/poses';
import type { CoupleBoothMediaService } from '../media/types';
import { getBoothServerTime, saveBoothCutout, uploadBoothCutout, upsertBoothShot } from '../api';
import type { SameSpaceLiveCaptureHandle } from '../components/SameSpaceVideoStage';
import type { CaptureViewportMode } from '@shared/boothSceneSpec';
import type { BoothCompanionSnapshot } from '@shared/coupleBoothStage';
import {
  claimBoothCaptureEvent,
  createBoothCaptureEvent,
  type BoothCaptureEvent,
} from '@shared/captureEvent';
import {
  captureSyncUserCopy,
  decideCaptureScheduleTiming,
  isCaptureSyncErrorCode,
  waitUntilLocalDeadline,
} from '../utils/captureSchedule';

type ServerCaptureSchedule = {
  captureId: string;
  shotIndex: number;
  captureAt: string;
};

function captureEventFromSchedule(schedule: ServerCaptureSchedule): BoothCaptureEvent {
  return createBoothCaptureEvent(schedule);
}

export type CaptureSyncNotice = {
  code: string;
  recovering: boolean;
  title: string;
  detail: string;
};

type Options = {
  media: CoupleBoothMediaService | null;
  sessionId: string;
  coupleId: string;
  userId: string;
  mediaExpiresAt?: string | null;
  sameSpaceEnabled?: boolean;
  captureViewportMode?: CaptureViewportMode;
  /** Live Same Space WYSIWYG capture — must snapshot the visible composite. */
  sameSpaceCaptureRef?: MutableRefObject<SameSpaceLiveCaptureHandle | null>;
  onShotProgress?: (shotIndex: number) => void;
  onAllShotsDone?: () => void;
  onError?: (error: Error) => void;
  onSyncNotice?: (notice: CaptureSyncNotice | null) => void;
  onProtocolMismatch?: (peerVersion: number) => void;
  /** Pure snapshot resolver; capture never waits for a pet asset or React animation frame. */
  resolveShutterCompanions?: () => BoothCompanionSnapshot[];
  onCompanionsCaptured?: (shotIndex: number, companions: BoothCompanionSnapshot[]) => void;
};

/**
 * Captures only from the authoritative schedule persisted on the Booth session.
 * LiveKit events are deliberately not used as a clock transport.
 */
export function useSynchronizedCapture(options: Options) {
  const scheduledIds = useRef(new Set<string>());
  const uploadedIds = useRef(new Set<string>());
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShot, setCurrentShot] = useState(0);
  const [busyCaptureId, setBusyCaptureId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [protocolBlocked, setProtocolBlocked] = useState(false);
  const [companionReaction, setCompanionReaction] = useState<'idle' | 'shutter' | 'postCapture'>('idle');
  const timers = useRef<number[]>([]);
  const cancelledCaptures = useRef(new Set<string>());
  const mediaRef = useRef(options.media);
  mediaRef.current = options.media;
  const mediaExpiresAtRef = useRef(options.mediaExpiresAt);
  mediaExpiresAtRef.current = options.mediaExpiresAt;
  const sameSpaceEnabledRef = useRef(Boolean(options.sameSpaceEnabled));
  sameSpaceEnabledRef.current = Boolean(options.sameSpaceEnabled);
  const sameSpaceCaptureRef = useRef(options.sameSpaceCaptureRef);
  sameSpaceCaptureRef.current = options.sameSpaceCaptureRef;
  const onSyncNoticeRef = useRef(options.onSyncNotice);
  onSyncNoticeRef.current = options.onSyncNotice;
  const resolveShutterCompanionsRef = useRef(options.resolveShutterCompanions);
  resolveShutterCompanionsRef.current = options.resolveShutterCompanions;
  const onCompanionsCapturedRef = useRef(options.onCompanionsCaptured);
  onCompanionsCapturedRef.current = options.onCompanionsCaptured;
  const reactionTimer = useRef<number | null>(null);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (reactionTimer.current != null) window.clearTimeout(reactionTimer.current);
  }, []);

  useEffect(() => {
    scheduledIds.current.clear();
    uploadedIds.current.clear();
    cancelledCaptures.current.clear();
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (reactionTimer.current != null) {
      window.clearTimeout(reactionTimer.current);
      reactionTimer.current = null;
    }
    setCountdown(null);
    setCurrentShot(0);
    setCompanionReaction('idle');
    onSyncNoticeRef.current?.(null);
  }, [options.sessionId]);

  const announceReady = async () => {
    const media = mediaRef.current;
    if (!media || !media.isConnected()) return false;
    await media.sendReliableEvent({
      type: 'ready',
      userId: options.userId,
      protocolVersion: COUPLE_BOOTH_PROTOCOL_VERSION,
    });
    return true;
  };

  const emitSyncNotice = (code: string, recovering: boolean) => {
    const copy = captureSyncUserCopy(code, recovering);
    onSyncNoticeRef.current?.({ code, recovering, ...copy });
  };

  const performCapture = async (schedule: ServerCaptureSchedule) => {
    const media = mediaRef.current;
    if (!media) return;
    if (protocolBlocked) {
      options.onError?.(new Error('PROTOCOL_MISMATCH'));
      return;
    }
    if (mediaExpiresAtRef.current && Date.parse(mediaExpiresAtRef.current) <= Date.now()) {
      options.onError?.(new Error('MEDIA_EXPIRED'));
      return;
    }
    setBusyCaptureId(schedule.captureId);
    setCompanionReaction('shutter');
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
    try {
      const useSameSpaceLive = sameSpaceEnabledRef.current
        && Boolean(sameSpaceCaptureRef.current?.current);

      let uri: string;
      let capturedAt: number;
      let mirrorX: boolean;
      let mirrorBakedIntoAsset: boolean;
      let cutoutBlob: Blob | null = null;

      if (useSameSpaceLive) {
        if (typeof media.prepareHighQualityCapture === 'function') {
          try {
            await media.prepareHighQualityCapture({ minWidth: 640, timeoutMs: 900 });
          } catch {
            /* capture still proceeds with whatever layer is available */
          }
        }
        const shutterCompanions = resolveShutterCompanionsRef.current?.() ?? [];
        onCompanionsCapturedRef.current?.(schedule.shotIndex, shutterCompanions);
        const live = await sameSpaceCaptureRef.current!.current!.captureWysiwyg({
          companions: shutterCompanions,
        });
        setCompanionReaction('postCapture');
        if (reactionTimer.current != null) window.clearTimeout(reactionTimer.current);
        reactionTimer.current = window.setTimeout(() => {
          setCompanionReaction('idle');
          reactionTimer.current = null;
        }, 360);
        uri = URL.createObjectURL(live.compositeBlob);
        capturedAt = Date.now();
        mirrorX = live.mirrorX;
        // Same Space FG cutout pixels are unmirrored; Review/export apply mirrorX once.
        mirrorBakedIntoAsset = false;
        cutoutBlob = live.localCutoutBlob;
      } else if (sameSpaceEnabledRef.current) {
        throw new Error('SAME_SPACE_CAPTURE_HANDLE_MISSING');
      } else {
        const frame = await media.captureLocalFrame({ captureViewportMode: options.captureViewportMode });
        uri = frame.uri;
        capturedAt = frame.capturedAt;
        mirrorX = frame.mirrorX ?? frame.mirrored;
        mirrorBakedIntoAsset = frame.mirrorBakedIntoAsset ?? true;
      }

      if (!validateUploadIdempotency(uploadedIds.current, schedule.captureId, options.userId)) {
        URL.revokeObjectURL(uri);
        return;
      }
      const shot = await upsertBoothShot({
        sessionId: options.sessionId,
        coupleId: options.coupleId,
        userId: options.userId,
        shotIndex: schedule.shotIndex,
        captureId: schedule.captureId,
        uri,
        capturedAt,
        mirrorX,
        mirrorBakedIntoAsset,
        cameraFacing: 'unknown',
      });
      URL.revokeObjectURL(uri);
      if (cutoutBlob) {
        const cutoutPath = `${options.coupleId}/${options.sessionId}/${options.userId}/cutout-${String(schedule.shotIndex).padStart(2, '0')}-${schedule.captureId.replace(/-/g, '').slice(0, 10)}.png`;
        void saveBoothCutout(shot.id, cutoutPath, 'processing')
          .then(() => uploadBoothCutout(cutoutPath, cutoutBlob!))
          .then(() => saveBoothCutout(shot.id, cutoutPath, 'ready'))
          .catch(() => saveBoothCutout(shot.id, cutoutPath, 'failed').catch(() => undefined));
      }
      await media.sendReliableEvent({
        type: 'upload_completed',
        captureId: schedule.captureId,
        shotIndex: schedule.shotIndex,
        userId: options.userId,
        storagePath: shot.imagePath,
      });
      onSyncNoticeRef.current?.(null);
      options.onShotProgress?.(schedule.shotIndex);
      if (schedule.shotIndex >= TOTAL_SHOTS) options.onAllShotsDone?.();
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error('CAPTURE_FAILED'));
    } finally {
      setBusyCaptureId(null);
      setCountdown(null);
      setCompanionReaction((current) => current === 'shutter' ? 'idle' : current);
    }
  };

  const scheduleServerCapture = async (schedule: ServerCaptureSchedule) => {
    if (!options.sessionId) return;
    const claim = claimBoothCaptureEvent(scheduledIds.current, captureEventFromSchedule(schedule));
    if (!claim.accepted) {
      if (claim.reason === 'invalid') options.onError?.(new Error('INVALID_CAPTURE_SCHEDULE'));
      return;
    }
    const targetServerMs = claim.event.captureAtMs;
    if (!Number.isFinite(targetServerMs)) {
      options.onError?.(new Error('INVALID_CAPTURE_SCHEDULE'));
      return;
    }
    cancelledCaptures.current.delete(schedule.captureId);
    setCurrentShot(schedule.shotIndex);
    try {
      const offsetMs = await getBoothServerTime(options.sessionId);
      const targetLocalMs = targetServerMs + offsetMs;
      const decision = decideCaptureScheduleTiming({
        targetLocalMs,
        nowLocalMs: Date.now(),
      });

      if (decision.action === 'missed') {
        setCountdown(null);
        emitSyncNotice('CAPTURE_SCHEDULE_MISSED', false);
        // Recoverable shot-level notice — never camera/equipment failure copy.
        options.onError?.(new Error('CAPTURE_SCHEDULE_MISSED'));
        return;
      }

      if (decision.action === 'capture-now') {
        console.info('[couple-booth][capture]', {
          phase: 'grace-capture',
          lateByMs: decision.lateByMs,
          shotIndex: schedule.shotIndex,
        });
        emitSyncNotice('CAPTURE_SCHEDULE_MISSED', true);
        void performCapture(schedule);
        return;
      }

      const waitResult = await waitUntilLocalDeadline(targetLocalMs, {
        onTick: (remainingMs) => {
          setCountdown(Math.max(0, Math.ceil(remainingMs / 1000)));
        },
        isCancelled: () => cancelledCaptures.current.has(schedule.captureId),
      });
      if (waitResult === 'cancelled') return;

      const lateDecision = decideCaptureScheduleTiming({
        targetLocalMs,
        nowLocalMs: Date.now(),
      });
      if (lateDecision.action === 'missed') {
        scheduledIds.current.delete(schedule.captureId);
        setCountdown(null);
        emitSyncNotice('CAPTURE_SCHEDULE_MISSED', false);
        options.onError?.(new Error('CAPTURE_SCHEDULE_MISSED'));
        return;
      }
      setCountdown(0);
      void performCapture(schedule);
    } catch (error) {
      setCountdown(null);
      const message = error instanceof Error ? error.message : 'CAPTURE_SCHEDULE_FAILED';
      if (isCaptureSyncErrorCode(message)) {
        emitSyncNotice(message, false);
      }
      options.onError?.(error instanceof Error ? error : new Error('CAPTURE_SCHEDULE_FAILED'));
    }
  };

  const handleEvent = (event: BoothRealtimeEvent) => {
    if (event.type === 'ready') {
      if (!protocolsCompatible(event.protocolVersion)) {
        setProtocolBlocked(true);
        options.onProtocolMismatch?.(event.protocolVersion);
        options.onError?.(new Error('PROTOCOL_MISMATCH'));
      }
      return;
    }
    if (event.type === 'protocol_mismatch') {
      setProtocolBlocked(true);
      options.onProtocolMismatch?.(event.peerProtocolVersion);
      options.onError?.(new Error('PROTOCOL_MISMATCH'));
    }
  };

  return {
    countdown,
    currentShot,
    busyCaptureId,
    flash,
    protocolBlocked,
    companionReaction,
    pose: poseForShot(Math.max(1, currentShot || 1)),
    handleEvent,
    scheduleServerCapture,
    announceReady,
  };
}
