import { useCallback, useEffect, useRef, useState } from 'react';
import { COUPLE_BOOTH_FEATURE_VERSION } from '@shared/types';
import { isValidBoothSessionId } from '@shared/entry';
import type { BoothRealtimeEvent } from '@shared/protocol';
import { BoothTokenError, isAuthFatalTokenCode, isNonRetryableTokenCode } from '@shared/tokenError';
import { markBoothConnected, requestBoothLiveKitToken } from '../api';
import { WebLiveKitCoupleBoothMediaService } from '../media/WebLiveKitCoupleBoothMediaService';
import type { BoothCameraDevice } from '../media/types';
import type { BoothCameraVisualState } from '../media/types';
import { formatCameraError } from '../../../lib/cameraErrors';
import { classifyMediaError, type BoothMediaErrorCode, type BoothMediaState } from '../media/mediaConnectionState';
import { BUILD_INFO } from '../../../lib/buildInfo';
import { logBoothJoin } from '../utils/boothJoinDiagnostics';

type Options = {
  sessionId?: string;
  userId?: string;
  /** Explicit Couple Booth partner identity — never infer from first remote participant. */
  partnerUserId?: string;
  enabled: boolean;
  onEvent?: (event: BoothRealtimeEvent) => void;
  onSessionExpired?: (sessionId: string) => Promise<void>;
};

export type BoothCleanupReason =
  | 'COMPONENT_UNMOUNT'
  | 'CONNECTION_KEY_CHANGED'
  | 'AUTH_USER_CHANGED'
  | 'ROOM_NAME_CHANGED'
  | 'MANUAL_RETRY'
  | 'STALE_STRICT_MODE_CLEANUP'
  | 'TOKEN_REQUEST_FAILED'
  | 'SESSION_BECAME_INELIGIBLE'
  | 'ROUTE_CHANGE'
  | 'USER_CANCEL'
  | 'SESSION_EXPIRED'
  | 'FAILURE'
  | 'STALE_ATTEMPT';

type MediaAttempt = {
  id: number;
  sessionId: string;
  sessionKey: string;
  connectionKey: string;
  media: WebLiveKitCoupleBoothMediaService | null;
  permissionStream: MediaStream | null;
  unsubscribe: (() => void) | null;
};

function sessionKey(sessionId: string): string {
  return sessionId.slice(0, 8);
}

function buildConnectionKey(userId: string, sessionId: string, livekitRoomName?: string | null): string {
  return `${userId}:${sessionId}:${livekitRoomName?.trim() || '_'}`;
}

function sanitizeBoothError(cause: unknown): { errorName: string; errorMessage: string } {
  const message = cause instanceof Error ? cause.message : 'Unknown error';
  return {
    errorName: cause instanceof Error ? cause.name : 'UnknownError',
    errorMessage: message
      .replace(/access_token=[^&\s]+/gi, 'access_token=<redacted>')
      .replace(/token=[^&\s]+/gi, 'token=<redacted>')
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>')
      .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '<jwt>')
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>'),
  };
}

export function useBoothMediaRoom(options: Options) {
  const mediaRef = useRef<WebLiveKitCoupleBoothMediaService | null>(null);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [remoteParticipantIdentity, setRemoteParticipantIdentity] = useState<string | null>(null);
  const [localMediaReady, setLocalMediaReady] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<BoothCameraDevice[]>([]);
  const [trackEpoch, setTrackEpoch] = useState(0);
  const [mediaState, setMediaState] = useState<BoothMediaState>('permission-intro');
  const [cameraVisual, setCameraVisual] = useState<BoothCameraVisualState>({ mirrorX: true, cameraFacing: 'unknown', mirrorMode: 'auto' });
  const [errorCode, setErrorCode] = useState<BoothMediaErrorCode | null>(null);
  const [tokenError, setTokenError] = useState<BoothTokenError | null>(null);
  const onEventRef = useRef(options.onEvent);
  const onSessionExpiredRef = useRef(options.onSessionExpired);
  const partnerUserIdRef = useRef(options.partnerUserId);
  const enabledRef = useRef(options.enabled);
  const mediaStateRef = useRef(mediaState);
  const activeAttemptRef = useRef<MediaAttempt | null>(null);
  const attemptSequenceRef = useRef(0);
  const connectionPromiseRef = useRef<Promise<void> | null>(null);
  const mediaPreparationPromiseRef = useRef<Promise<boolean> | null>(null);
  const currentSessionIdRef = useRef(options.sessionId);
  const currentUserIdRef = useRef(options.userId);
  const connectionKeyRef = useRef<string | null>(null);
  const livekitRoomNameRef = useRef<string | null>(null);
  const connectionGenerationRef = useRef(0);
  const authFatalLockRef = useRef(false);
  const tokenRetryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const previousBaseKeyRef = useRef<string | null>(null);
  const connectionStateRef = useRef(connectionState);
  currentSessionIdRef.current = options.sessionId;
  currentUserIdRef.current = options.userId;
  onEventRef.current = options.onEvent;
  onSessionExpiredRef.current = options.onSessionExpired;
  partnerUserIdRef.current = options.partnerUserId;
  enabledRef.current = options.enabled;
  mediaStateRef.current = mediaState;
  connectionStateRef.current = connectionState;

  const isCurrent = useCallback(
    (attempt: MediaAttempt) => activeAttemptRef.current?.id === attempt.id && currentSessionIdRef.current === attempt.sessionId,
    [],
  );

  const cleanupAttempt = useCallback(async (
    attempt: MediaAttempt,
    reason: BoothCleanupReason | string,
    details: Record<string, unknown> = {},
  ) => {
    const generation = connectionGenerationRef.current;
    console.info('[couple-booth][attempt] cleanup', {
      cleanupReason: reason,
      actualUnmount: !mountedRef.current,
      connectionKey: attempt.connectionKey,
      previousConnectionGeneration: generation,
      currentConnectionGeneration: connectionGenerationRef.current,
      roomObjectId: attempt.media ? `media:${attempt.id}` : null,
      roomState: connectionStateRef.current,
      attemptId: attempt.id,
      sessionKey: attempt.sessionKey,
      ...details,
    });
    attempt.permissionStream?.getTracks().forEach((track) => track.stop());
    attempt.permissionStream = null;
    attempt.unsubscribe?.();
    attempt.unsubscribe = null;
    if (mediaRef.current === attempt.media) mediaRef.current = null;
    const media = attempt.media;
    attempt.media = null;
    // Token failures before connect must not invent disconnect churn.
    if (media) await media.disconnect(String(reason));
  }, []);

  const resetUiToIntro = useCallback(() => {
    setRemoteConnected(false);
    setRemoteParticipantIdentity(null);
    setLocalMediaReady(false);
    setCameras([]);
    setConnectionState('disconnected');
    setError(null);
    setErrorCode(null);
    setTokenError(null);
    setMediaState('permission-intro');
  }, []);

  const cancelMediaConnection = useCallback(async (
    reason: BoothCleanupReason | string = 'USER_CANCEL',
    details: Record<string, unknown> = {},
  ) => {
    const attempt = activeAttemptRef.current;
    activeAttemptRef.current = null;
    connectionPromiseRef.current = null;
    livekitRoomNameRef.current = null;
    if (attempt) await cleanupAttempt(attempt, reason, details);
    resetUiToIntro();
  }, [cleanupAttempt, resetUiToIntro]);

  const startMediaConnection = useCallback(async () => {
    if (connectionPromiseRef.current) {
      console.info('[couple-booth][attempt] single-flight-join');
      return connectionPromiseRef.current;
    }
    if (mediaStateRef.current === 'connected') return;
    if (authFatalLockRef.current) {
      console.info('[couple-booth][attempt] blocked-auth-fatal');
      return;
    }

    const sessionId = currentSessionIdRef.current;
    const userId = currentUserIdRef.current;
    if (!enabledRef.current || !isValidBoothSessionId(sessionId) || !userId) return;

    const connectionKey = buildConnectionKey(userId, sessionId, livekitRoomNameRef.current);
    connectionKeyRef.current = connectionKey;
    const generation = ++connectionGenerationRef.current;

    const attempt: MediaAttempt = {
      id: ++attemptSequenceRef.current,
      sessionId,
      sessionKey: sessionKey(sessionId),
      connectionKey,
      media: null,
      permissionStream: null,
      unsubscribe: null,
    };
    activeAttemptRef.current = attempt;

    const run = async () => {
      let phase = 'permission';
      console.info('[couple-booth][attempt] start', {
        attemptId: attempt.id,
        sessionKey: attempt.sessionKey,
        connectionKey,
        connectionGeneration: generation,
        build: BUILD_INFO,
      });
      const updateIfCurrent = (update: () => void) => {
        if (isCurrent(attempt) && connectionGenerationRef.current === generation) update();
      };
      updateIfCurrent(() => {
        setError(null);
        setErrorCode(null);
        setTokenError(null);
      });
      if (!isCurrent(attempt) || connectionGenerationRef.current !== generation) return;
      const reportPhase = (phaseName: string, details: Record<string, unknown> = {}) => {
        console.info('[couple-booth][attempt]', {
          attemptId: attempt.id,
          sessionKey: attempt.sessionKey,
          connectionKey,
          phase: phaseName,
          ...details,
        });
      };
      const media = new WebLiveKitCoupleBoothMediaService({
        attemptId: attempt.id,
        sessionKey: attempt.sessionKey,
        onPhase: reportPhase,
      });
      media.setExpectedPartnerIdentity(partnerUserIdRef.current);
      attempt.media = media;
      mediaRef.current = media;
      attempt.unsubscribe = media.subscribe({
        onRemoteParticipant: (participant) => {
          updateIfCurrent(() => setRemoteConnected(Boolean(participant?.connected)));
          updateIfCurrent(() => setRemoteParticipantIdentity(participant?.identity ?? null));
          if (participant?.connected) {
            logBoothJoin({
              phase: 'remote_participant_detected',
              sessionIdPresent: true,
              sessionKey: attempt.sessionKey,
            });
          }
        },
        onConnectionState: (state) => updateIfCurrent(() => setConnectionState(state)),
        onEvent: (event) => {
          if (isCurrent(attempt) && connectionGenerationRef.current === generation) {
            onEventRef.current?.(event);
          }
        },
        onError: (cause) => updateIfCurrent(() => setError(cause.message)),
        onLocalTrackChanged: () => updateIfCurrent(() => setTrackEpoch((value) => value + 1)),
      });

      try {
        updateIfCurrent(() => {
          setMediaState('connecting-room');
          setConnectionState('connecting');
        });
        phase = 'token-request';
        logBoothJoin({
          phase: 'token_request_started',
          sessionIdPresent: true,
          sessionKey: attempt.sessionKey,
        });
        console.info('[couple-booth][attempt] token-request', {
          attemptId: attempt.id,
          sessionKey: attempt.sessionKey,
          connectionKey,
          retryCount: tokenRetryCountRef.current,
        });
        const token = await requestBoothLiveKitToken(sessionId, {
          attemptId: attempt.id,
          sessionKey: attempt.sessionKey,
          expectedUserId: userId,
          retryCount: tokenRetryCountRef.current,
        });
        if (!isCurrent(attempt) || connectionGenerationRef.current !== generation) {
          await cleanupAttempt(attempt, 'STALE_ATTEMPT', { changedDependencies: ['generation'] });
          return;
        }
        livekitRoomNameRef.current = token.roomName;
        attempt.connectionKey = buildConnectionKey(userId, sessionId, token.roomName);
        connectionKeyRef.current = attempt.connectionKey;
        logBoothJoin({
          phase: 'token_request_succeeded',
          sessionIdPresent: true,
          sessionKey: attempt.sessionKey,
          message: token.roomName ? `room:${token.roomName.slice(0, 12)}` : undefined,
        });
        phase = 'room-connect-call';
        logBoothJoin({
          phase: 'livekit_connect_started',
          sessionIdPresent: true,
          sessionKey: attempt.sessionKey,
        });
        await media.connect({
          url: token.url,
          token: token.token,
          roomName: token.roomName,
          userId,
          metadata: { platform: 'web', appVersion: '1.0.0-web', featureVersion: COUPLE_BOOTH_FEATURE_VERSION },
        });
        if (!isCurrent(attempt) || connectionGenerationRef.current !== generation) {
          await cleanupAttempt(attempt, 'STALE_ATTEMPT', { changedDependencies: ['generation-after-connect'] });
          return;
        }
        logBoothJoin({
          phase: 'livekit_connected',
          sessionIdPresent: true,
          sessionKey: attempt.sessionKey,
        });
        console.info('[couple-booth][attempt] room-connected', {
          attemptId: attempt.id,
          sessionKey: attempt.sessionKey,
          connectionKey: attempt.connectionKey,
        });
        phase = 'enumerate-cameras';
        const list = await media.enumerateCameras();
        if (!isCurrent(attempt) || connectionGenerationRef.current !== generation) {
          await cleanupAttempt(attempt, 'STALE_ATTEMPT');
          return;
        }
        updateIfCurrent(() => {
          setCameras(list);
          setMediaState('connected');
        });
        phase = 'mark-booth-connected';
        try {
          await markBoothConnected(sessionId);
        } catch (presenceError) {
          console.warn('[couple-booth][presence]', {
            attemptId: attempt.id,
            sessionKey: attempt.sessionKey,
            phase,
            ...sanitizeBoothError(presenceError),
          });
        }
        reportPhase('room-ready');
        tokenRetryCountRef.current = 0;
        updateIfCurrent(() => setMediaState('connected'));
      } catch (cause) {
        if (!isCurrent(attempt) || connectionGenerationRef.current !== generation) {
          await cleanupAttempt(attempt, 'STALE_ATTEMPT', { phase });
          return;
        }
        console.error('[couple-booth][attempt] failed', {
          attemptId: attempt.id,
          sessionKey: attempt.sessionKey,
          connectionKey: attempt.connectionKey,
          phase,
          ...sanitizeBoothError(cause),
        });
        if (cause instanceof BoothTokenError && cause.code === 'SESSION_EXPIRED') {
          const shouldRecover = isCurrent(attempt) && mountedRef.current && currentSessionIdRef.current === sessionId;
          activeAttemptRef.current = null;
          await cleanupAttempt(attempt, 'SESSION_EXPIRED');
          if (shouldRecover && mountedRef.current && currentSessionIdRef.current === sessionId) {
            await onSessionExpiredRef.current?.(sessionId);
          }
          return;
        }
        if (cause instanceof BoothTokenError) {
          if (isAuthFatalTokenCode(cause.code) || isNonRetryableTokenCode(cause.code)) {
            authFatalLockRef.current = true;
          }
          updateIfCurrent(() => {
            setTokenError(cause);
            setErrorCode('connection-error');
            setMediaState('connection-error');
            setError(cause.code);
          });
          logBoothJoin({
            phase: 'join_failed',
            sessionIdPresent: true,
            sessionKey: attempt.sessionKey,
            httpStatus: cause.status,
            code: cause.code,
            message: cause.messageText ?? cause.code,
          });
          activeAttemptRef.current = null;
          // Tear down only the in-progress attempt — do not bounce to permission-intro
          // (that would auto-retry 401 forever).
          await cleanupAttempt(attempt, 'TOKEN_REQUEST_FAILED', { tokenCode: cause.code });
          return;
        }
        updateIfCurrent(() => {
          const code = classifyMediaError(cause, phase);
          setErrorCode(code);
          setMediaState(code);
          setError(formatCameraError(cause));
        });
        logBoothJoin({
          phase: 'join_failed',
          sessionIdPresent: true,
          sessionKey: attempt.sessionKey,
          code: classifyMediaError(cause, phase),
          message: formatCameraError(cause),
        });
        activeAttemptRef.current = null;
        await cleanupAttempt(attempt, 'FAILURE', { phase });
      }
    };

    const promise = run();
    connectionPromiseRef.current = promise;
    try {
      await promise;
    } finally {
      if (connectionPromiseRef.current === promise) connectionPromiseRef.current = null;
    }
  }, [cleanupAttempt, isCurrent]);

  const enableLocalMedia = useCallback(async (): Promise<boolean> => {
    if (mediaPreparationPromiseRef.current) return mediaPreparationPromiseRef.current;
    const media = mediaRef.current;
    if (!media || !media.isConnected()) return false;

    const run = (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setMediaState('unsupported');
        setErrorCode('unsupported');
        return false;
      }

      setError(null);
      setErrorCode(null);
      setMediaState('requesting-permission');
      let permissionStream: MediaStream | null = null;
      try {
        permissionStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 20 } },
          audio: false,
        });
        permissionStream.getTracks().forEach((track) => track.stop());
        permissionStream = null;

        setMediaState('publishing-media');
        await media.enableCamera();
        const visual = media.getCameraVisualState();
        setCameraVisual(visual);
        await media.setParticipantMetadata({
          platform: 'web',
          appVersion: '1.0.0-web',
          featureVersion: COUPLE_BOOTH_FEATURE_VERSION,
          ...visual,
        });
        await media.enableMicrophone();
        if (mediaRef.current !== media) return false;
        setLocalMediaReady(true);
        setMediaState('connected');
        return true;
      } catch (cause) {
        permissionStream?.getTracks().forEach((track) => track.stop());
        try {
          await media.disableCamera();
          await media.getRoom()?.localParticipant.setMicrophoneEnabled(false);
        } catch {
          // Best-effort rollback; the room disconnect still owns final cleanup.
        }
        const code = classifyMediaError(cause);
        setErrorCode(code);
        setMediaState(code);
        setError(formatCameraError(cause));
        return false;
      }
    })();

    mediaPreparationPromiseRef.current = run;
    try {
      return await run;
    } finally {
      if (mediaPreparationPromiseRef.current === run) mediaPreparationPromiseRef.current = null;
    }
  }, []);

  const disableLocalMedia = useCallback(async (): Promise<void> => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      await media.disableCamera();
      await media.getRoom()?.localParticipant.setMicrophoneEnabled(false);
    } catch {
      // Disconnect cleanup remains the final safety net.
    }
    setLocalMediaReady(false);
    if (media.isConnected()) setMediaState('connected');
  }, []);

  const retryMediaConnection = useCallback(async () => {
    authFatalLockRef.current = false;
    tokenRetryCountRef.current += 1;
    await cancelMediaConnection('MANUAL_RETRY');
    await startMediaConnection();
  }, [cancelMediaConnection, startMediaConnection]);

  useEffect(() => {
    mediaRef.current?.setExpectedPartnerIdentity(options.partnerUserId);
  }, [options.partnerUserId, trackEpoch, connectionState]);

  // Connection identity: auth user + booth session (+ room name once known).
  // Session object identity / capture UI state must never reconnect.
  useEffect(() => {
    const userId = options.userId;
    const sessionId = options.sessionId;
    const nextBaseKey = userId && isValidBoothSessionId(sessionId)
      ? `${userId}:${sessionId}`
      : null;
    const previousBaseKey = previousBaseKeyRef.current;

    if (nextBaseKey !== previousBaseKey) {
      const reason: BoothCleanupReason = !nextBaseKey
        ? 'SESSION_BECAME_INELIGIBLE'
        : !previousBaseKey
          ? 'ROUTE_CHANGE'
          : previousBaseKey.split(':')[0] !== nextBaseKey.split(':')[0]
            ? 'AUTH_USER_CHANGED'
            : 'CONNECTION_KEY_CHANGED';
      previousBaseKeyRef.current = nextBaseKey;
      livekitRoomNameRef.current = null;
      if (previousBaseKey) {
        void cancelMediaConnection(reason, {
          changedDependencies: ['authUserId', 'sessionId'],
          previousConnectionKey: previousBaseKey,
          currentConnectionKey: nextBaseKey,
        });
      }
    }
  }, [cancelMediaConnection, options.sessionId, options.userId]);

  // Soft-disable: brief mediaEnabled flicker must not tear down a live room.
  useEffect(() => {
    if (options.enabled) return;
    const timer = window.setTimeout(() => {
      if (enabledRef.current) return;
      if (!activeAttemptRef.current && mediaStateRef.current === 'permission-intro') return;
      void cancelMediaConnection('SESSION_BECAME_INELIGIBLE', {
        changedDependencies: ['enabled'],
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [cancelMediaConnection, options.enabled]);

  // Auto-start once the session is media-active. Auth-fatal locks block 401 loops.
  useEffect(() => {
    if (!options.enabled || !isValidBoothSessionId(options.sessionId) || !options.userId) return;
    if (mediaState !== 'permission-intro') return;
    if (authFatalLockRef.current) return;
    void startMediaConnection();
  }, [mediaState, options.enabled, options.sessionId, options.userId, startMediaConnection]);

  // Defer unmount teardown so React StrictMode remount can reuse the in-flight join.
  useEffect(() => {
    mountedRef.current = true;
    const generationAtMount = connectionGenerationRef.current;
    return () => {
      mountedRef.current = false;
      const sessionIdAtUnmount = currentSessionIdRef.current;
      const generationAtUnmount = generationAtMount;
      window.setTimeout(() => {
        if (mountedRef.current) return;
        if (currentSessionIdRef.current !== sessionIdAtUnmount) return;
        if (connectionGenerationRef.current !== generationAtUnmount) {
          console.info('[couple-booth][attempt] cleanup', {
            cleanupReason: 'STALE_STRICT_MODE_CLEANUP',
            actualUnmount: true,
            previousConnectionGeneration: generationAtUnmount,
            currentConnectionGeneration: connectionGenerationRef.current,
          });
          return;
        }
        void cancelMediaConnection('COMPONENT_UNMOUNT');
      }, 75);
    };
  }, [cancelMediaConnection]);

  return {
    media: mediaRef.current,
    mediaRef,
    remoteConnected,
    remoteParticipantIdentity,
    localMediaReady,
    connectionState,
    error,
    cameras,
    trackEpoch,
    mediaState,
    errorCode,
    tokenError,
    connectionKey: connectionKeyRef.current,
    cameraVisual,
    selectCamera: async (deviceId: string) => {
      const media = mediaRef.current;
      if (!media) return;
      await media.selectCamera(deviceId);
      const visual = media.getCameraVisualState();
      setCameraVisual(visual);
      await media.setParticipantMetadata({
        platform: 'web',
        appVersion: '1.0.0-web',
        featureVersion: COUPLE_BOOTH_FEATURE_VERSION,
        ...visual,
      });
    },
    setMirrorX: async (mirrorX: boolean) => {
      const media = mediaRef.current;
      if (!media) return;
      media.setMirrorX(mirrorX);
      const visual = media.getCameraVisualState();
      setCameraVisual(visual);
      await media.setParticipantMetadata({
        platform: 'web',
        appVersion: '1.0.0-web',
        featureVersion: COUPLE_BOOTH_FEATURE_VERSION,
        ...visual,
      });
    },
    startMediaConnection,
    enableLocalMedia,
    disableLocalMedia,
    retryMediaConnection,
    disconnect: cancelMediaConnection,
    cancelMediaConnection,
  };
}
