import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Room } from 'livekit-client';
import {
  COUPLE_BOOTH_CAPTURE_DURATION_SECONDS,
  REQUIRED_SELECTED_SHOTS,
  TOTAL_SHOTS,
  type BoothSession,
  type BoothShotRow,
} from '@shared/types';
import type { BoothRealtimeEvent } from '@shared/protocol';
import { isMediaActiveStatus } from '@shared/stateMachine';
import { eligibleBoothRoomShotSources } from '@shared/roomHandoff';
import { resetReadyBarrierOnParticipantLifecycle } from '@shared/readyBarrier';
import { canScheduleManualShot, planCaptureAutoStart } from '@shared/captureAction';
import {
  canInitializeLocalMedia,
  canShowBoothCameraStage,
  resolveBoothReadyCta,
} from '@shared/lobby';
import { isValidBoothSessionId } from '@shared/entry';
import {
  buildCandidates,
  canScheduleNextCapture,
  captureTimerPhase,
  formatCaptureCountdown,
  isCaptureClockActive,
  mediaRemainingSeconds,
} from '@shared/validation';
import {
  canShowSameSpaceComposition,
  canShowSameSpaceLayers,
  cutoutUrlKey,
  findParticipantShot,
  resolveSameSpaceShotAssets,
} from '@shared/sameSpaceAssets';
import {
  DEFAULT_SAME_SPACE_BACKGROUND,
  backgroundPathBelongsToSession,
  backgroundKeyFromSameSpaceBackground,
  sameSpaceBackgroundFromKey,
  isOurRoomBackground,
  ourRoomFrontPlatePath,
  ourRoomIncludesPets,
  type SameSpaceBackground,
} from '@shared/sameSpaceBackground';
import {
  isSameSpaceBackgroundKey,
  type SameSpaceBackgroundKey,
} from '@shared/sameSpaceBackgroundPresets';
import {
  BOOTH_COLOR_MODE_FILTER,
  DEFAULT_BOOTH_COLOR_MODE,
  parseBoothColorMode,
  type BoothColorMode,
} from '@shared/boothColorMode';
import {
  DEFAULT_SAME_SPACE_COMPOSITION_META,
  packSlotCropsWithMeta,
  slotFrontSlotFor,
  slotManualOffsetsFor,
  slotSubjectPlacementsFor,
  slotFrontSubjectIdFor,
  type SameSpaceCompositionMeta,
} from '@shared/sameSpaceCompositionMeta';
import {
  DEFAULT_BOOTH_SCENE_SPAN_MODE,
  DEFAULT_CAPTURE_VIEWPORT_MODE,
  LIVE_CAPTURE_SCENE_SPAN_MODE,
  type CaptureViewportMode,
  parseBoothSceneSpanMode,
  type BoothSceneSpanMode,
} from '@shared/boothSceneSpec';
import {
  DEFAULT_SAME_SPACE_MANUAL_OFFSET,
  resolveSessionParticipantSlots,
  type SameSpaceManualOffset,
} from '@shared/sameSpaceLayoutSpec';
import {
  placementForSubject,
  type SubjectPlacement,
} from '@shared/subjectPlacement';
import { isCaptureSyncErrorCode } from '../utils/captureSchedule';
import type { CaptureSyncNotice } from '../hooks/useSynchronizedCapture';
import {
  reviewCaptureShortageCopy,
  shouldShowReviewFatalBanner,
} from '../utils/boothPageIssue';
import { SameSpaceCompositionEditor } from '../components/SameSpaceCompositionEditor';
import {
  buildCompositionEditorTarget,
  compositionEditorTitle,
  type CompositionEditorTarget,
} from '../utils/compositionEditorTarget';
import {
  isExactSelection,
  moveSelectedShotDown,
  moveSelectedShotUp,
  selectionOrderLabel,
} from '@shared/selection';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { supabase } from '../../../lib/supabase';
import {
  beginBoothFinalization,
  cancelBoothSession,
  completeBoothSession,
  createBoothMemory,
  getOrCreateBoothSession,
  getBoothSession,
  listBoothShots,
  loadBoothReviewUrls,
  setBoothReady,
  signedBoothUrl,
  setSameSpaceMode,
  scheduleBoothShot,
  startBoothCapture,
  subscribeBoothSession,
  updateBoothApproval,
  updateBoothComposition,
  updateBoothSelection,
  updateBoothPositions,
  swapBoothPositions,
  probeBoothPositionCapabilities,
  requestBoothRoomImport,
  updateBoothParticipantTransform,
  updateBoothStyle,
  uploadBoothBackgroundImage,
  waitForBoothCompletion,
} from '../api';
import { classifyBoothPositionError } from '../utils/boothPositionErrors';
import { BoothGuestLinkPanel } from '../components/BoothGuestLinkPanel';
import { BoothStageMenu } from '../components/BoothStageMenu';
import { BoothCountdown } from '../components/BoothCountdown';
import { BoothVideoStage } from '../components/BoothVideoStage';
import { SameSpaceBackgroundEditor } from '../components/SameSpaceBackgroundEditor';
import { SameSpaceBackgroundPicker } from '../components/SameSpaceBackgroundPicker';
import { loadBoothRoomSnapshot, removeSupersededBoothRoomPlates, uploadBoothRoomPlates } from '../ourRoom/ourRoomApi';
import { renderBoothRoomPlates } from '../ourRoom/roomBoothCanvas';
import { SameSpaceScenePreview } from '../components/SameSpaceScenePreview';
import { SameSpaceVideoStage, type SameSpaceLiveCaptureHandle } from '../components/SameSpaceVideoStage';
import { BoothSceneSpanModePicker } from '../components/BoothSceneSpanModePicker';
import { ShotCandidateGrid } from '../components/ShotCandidateGrid';
import { ShotLightbox } from '../components/ShotLightbox';
import { BoothFinalizeError, boothFinalizeUserMessage } from '@shared/finalizeError';
import { useBoothMediaRoom } from '../hooks/useBoothMediaRoom';
import { useSynchronizedCapture } from '../hooks/useSynchronizedCapture';
import { WebLiveKitCoupleBoothMediaService } from '../media/WebLiveKitCoupleBoothMediaService';
import { mediaErrorCopy } from '../media/mediaConnectionState';
import { classifyBoothJoinFailure } from '../utils/boothJoinErrors';
import { clearGuestLinkTokenCache } from '../utils/guestLinkTokenCache';
import { BUILD_INFO } from '../../../lib/buildInfo';
import { maskId } from '@shared/tokenError';
import {
  boothStageConnectionCopy,
  isBoothMediaErrorState,
  resolveBoothStageConnectionUx,
} from '../utils/boothStageConnection';
import {
  BOOTH_FRAME_OPTIONS,
  boothCropCssTransform,
  composeFinalBoothStrip,
  DEFAULT_BOOTH_CROP,
  type BoothFrameId,
  type BoothCropTransform,
  type FinalStripCell,
} from '../utils/boothComposer';
import { posePrompt } from '../utils/poseCopy';
import { PetDecoratePanel } from '../components/PetDecoratePanel';
import { BoothCompanionOverlay } from '../components/BoothCompanionOverlay';
import { fetchCouplePets } from '../petApi';
import type { CouplePet } from '../companions/couplePetBoothAdapter';
import {
  couplePetsToBoothCompanionSnapshots,
} from '../companions/couplePetBoothAdapter';
import { canChangeBoothRoomSnapshot } from '@couplePet';
import { sameSpaceCutoutMirrorMeta } from '@shared/mirrorDraw';
import {
  applyBoothPoseEvent,
  couplePoseRoleForParticipant,
  createBoothPoseEvent,
  isCouplePoseId,
  type BoothPoseEvent,
  type CouplePoseId,
} from '@shared/poseGuide';
import { CouplePosePicker } from '../components/CouplePosePicker';
import {
  applyBoothSharedSceneEvent,
  createBoothSharedSceneEvent,
  isBoothSharedSceneId,
  type BoothSharedSceneEvent,
  type BoothSharedSceneId,
} from '@shared/sharedScene';
import { BoothSharedScenePicker } from '../components/BoothSharedScenePicker';
import {
  applyBoothLightingModeEvent,
  createBoothLightingModeEvent,
  type BoothLightingModeEvent,
} from '@shared/participantLighting';
import {
  createBoothCompanionStateEvent,
  isNewerBoothCompanionStateEvent,
  normalizeBoothCompanionPlacements,
  type BoothCompanionPlacement,
  type BoothCompanionStateEvent,
} from '@shared/companionState';
import type { BoothCompanionSnapshot } from '@shared/coupleBoothStage';
import {
  boothCompanionReactionForCountdown,
  resolveBoothCompanionPresentation,
  resolveBoothCompanionReaction,
} from '@shared/companionReaction';

/** Local fallback — do not depend on uncommitted couplePet tiger exports for Vercel builds. */
export function BoothSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const validSessionId = isValidBoothSessionId(sessionId) ? sessionId : undefined;
  const sessionIdForRequest = () => {
    if (!validSessionId) throw new Error('INVALID_BOOTH_SESSION_ID');
    return validSessionId;
  };
  const { user, profile, loading, signOut } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const isGuestLinkMode = Boolean(
    validSessionId && typeof sessionStorage !== 'undefined'
      && sessionStorage.getItem(`booth_guest_mode:${validSessionId}`) === '1',
  );

  const [session, setSession] = useState<BoothSession | null>(null);
  const [shots, setShots] = useState<BoothShotRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [frameId, setFrameId] = useState<BoothFrameId>('classic');
  const [sameSpaceEnabledOverride, setSameSpaceEnabledOverride] = useState<boolean | null>(null);
  const [slotCrops, setSlotCrops] = useState<Record<number, BoothCropTransform>>({});
  const [sameSpaceMeta, setSameSpaceMeta] = useState<SameSpaceCompositionMeta>(DEFAULT_SAME_SPACE_COMPOSITION_META);
  const [captureViewportMode, setCaptureViewportMode] = useState<CaptureViewportMode>(DEFAULT_CAPTURE_VIEWPORT_MODE);
  const [pets, setPets] = useState<CouplePet[]>([]);
  const [pageError, setPageError] = useState<string | null>(null);
  const [assetLoadError, setAssetLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeState, setFinalizeState] = useState<'idle' | 'validating' | 'submitting' | 'completed' | 'failed'>('idle');
  const [finalizeDevMeta, setFinalizeDevMeta] = useState<{
    requestId?: string;
    code?: string;
    stage?: string;
  } | null>(null);  const [previewShotIndex, setPreviewShotIndex] = useState<number | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [handoffChooserOpen, setHandoffChooserOpen] = useState(false);
  const [handoffBusyKey, setHandoffBusyKey] = useState<string | null>(null);
  const [handoffReadyKey, setHandoffReadyKey] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [shotIndex, setShotIndex] = useState(0);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [captureHint, setCaptureHint] = useState<string | null>(null);
  const [captureSyncNotice, setCaptureSyncNotice] = useState<CaptureSyncNotice | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [prepareRequested, setPrepareRequested] = useState(false);
  const [readyBusy, setReadyBusy] = useState(false);
  const [compositionEditTarget, setCompositionEditTarget] = useState<CompositionEditorTarget | null>(null);
  const stripPreviewRef = useRef<HTMLElement | null>(null);
  const stripScrollTopRef = useRef(0);
  const [micEnabled, setMicEnabled] = useState(true);
  const [recoveryState, setRecoveryState] = useState<'idle' | 'recovering-expired-session' | 'recovery-failed'>('idle');
  /** null = probing; false = RPC missing; true = ready */
  const [positionRpcReady, setPositionRpcReady] = useState<boolean | null>(null);
  const [positionDevHint, setPositionDevHint] = useState<string | null>(null);
  const [liveTransforms, setLiveTransforms] = useState<Record<string, SameSpaceManualOffset>>({});
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const [preparingOurRoom, setPreparingOurRoom] = useState(false);
  const [colorMode, setColorMode] = useState<BoothColorMode>(DEFAULT_BOOTH_COLOR_MODE);
  const [poseEvent, setPoseEvent] = useState<BoothPoseEvent | null>(null);
  const poseEventRef = useRef<BoothPoseEvent | null>(null);
  const [sharedSceneEvent, setSharedSceneEvent] = useState<BoothSharedSceneEvent | null>(null);
  const sharedSceneEventRef = useRef<BoothSharedSceneEvent | null>(null);
  const [lightingModeEvent, setLightingModeEvent] = useState<BoothLightingModeEvent | null>(null);
  const lightingModeEventRef = useRef<BoothLightingModeEvent | null>(null);
  const [companionEvent, setCompanionEvent] = useState<BoothCompanionStateEvent | null>(null);
  const companionEventRef = useRef<BoothCompanionStateEvent | null>(null);
  const [tapReactionPetIds, setTapReactionPetIds] = useState<Set<string>>(() => new Set());
  const tapReactionTimersRef = useRef(new Map<string, number>());
  const [capturedCompanionsByShot, setCapturedCompanionsByShot] = useState<Record<number, BoothCompanionSnapshot[]>>({});
  /** Review packing mode — independent from live (always two_cell). */
  const [reviewSceneSpanMode, setReviewSceneSpanMode] = useState<BoothSceneSpanMode>(
    LIVE_CAPTURE_SCENE_SPAN_MODE,
  );
  const reviewSpanDirtyRef = useRef(false);
  const reviewSpanHydratedSessionRef = useRef<string | null>(null);
  /** Review: local sceneSpanMode draft wins over stale realtime hydrates. */
  const sceneSpanLocalDirtyRef = useRef(false);
  const sceneSpanAppliedServerRevRef = useRef(0);
  const eventHandlerRef = useRef<(event: BoothRealtimeEvent) => void>(() => undefined);
  const finalizingLock = useRef(false);
  const finalizeRequestIdRef = useRef<string | null>(null);
  const captureStartLock = useRef(false);
  const expiryHandled = useRef(false);
  const completionCallbackSent = useRef(false);
  const sameSpaceCaptureRef = useRef<SameSpaceLiveCaptureHandle | null>(null);
  const recoveryPromiseRef = useRef<Promise<void> | null>(null);
  const reloadAbortRef = useRef<AbortController | null>(null);

  const isHost = Boolean(session && user && session.hostUserId === user.id);
  const isGuest = Boolean(session && user && session.guestUserId === user.id);
  const eligibleHandoffShots = useMemo(
    () => session ? eligibleBoothRoomShotSources(session, shots) : [],
    [session, shots],
  );
  const clockActive = isCaptureClockActive({
    captureStartedAt: session?.captureStartedAt,
    mediaExpiresAt: session?.mediaExpiresAt,
  });
  const sameSpaceEnabled = Boolean(
    (sameSpaceEnabledOverride ?? session?.sameSpaceEnabled)
      && import.meta.env.VITE_SAME_SPACE_MODE_ENABLED === 'true',
  );
  // Before capture starts, readiness is an ephemeral LiveKit barrier. Once a
  // server-authoritative capture is already active (for example after reload),
  // the persisted session readiness remains sufficient for continuing shots.
  const bothReady = clockActive
    ? Boolean(session?.hostReady && session?.guestReady)
    : localReady && remoteReady;
  const mediaEnabled = Boolean(
    user &&
      session &&
      isMediaActiveStatus(session.status) &&
      session.status !== 'invited',
  );

  const recoverExpiredSession = useCallback(async () => {
    // A media-expired capturing session is not reusable. Do not ask the entry
    // RPC to recover it automatically, because it correctly returns the same
    // still-active session until the user explicitly abandons it.
    setRecoveryState('recovery-failed');
    setPageError(null);
  }, []);

  const discardAndCreateFreshSession = useCallback(async () => {
    if (!validSessionId || recoveryPromiseRef.current) return;
    const restart = (async () => {
      setRecoveryState('recovering-expired-session');
      setPageError(null);
      try {
        await cancelBoothSession(validSessionId, 'restart_after_media_expired');
        const next = await getOrCreateBoothSession();
        if (!isValidBoothSessionId(next.id) || next.id === validSessionId) {
          throw new Error('FRESH_BOOTH_SESSION_NOT_CREATED');
        }
        navigate(`/booth/${next.id}`, { replace: true });
      } catch (error) {
        setRecoveryState('recovery-failed');
        setPageError(error instanceof Error ? error.message : 'FRESH_BOOTH_CREATION_FAILED');
      }
    })();
    recoveryPromiseRef.current = restart;
    try {
      await restart;
    } finally {
      recoveryPromiseRef.current = null;
    }
  }, [navigate, validSessionId]);

  const partnerUserId = useMemo(() => {
    if (!session || !user) return undefined;
    if (user.id === session.hostUserId) return session.guestUserId;
    if (user.id === session.guestUserId) return session.hostUserId;
    return undefined;
  }, [session, user]);

  useEffect(() => {
    let cancelled = false;
    const coupleId = profile?.coupleId;
    if (!coupleId) {
      setPets([]);
      return;
    }
    void (async () => {
      try {
        const nextPets = await fetchCouplePets(coupleId);
        if (!cancelled) setPets(nextPets);
      } catch {
        if (!cancelled) setPets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.coupleId]);

  const mediaRoom = useBoothMediaRoom({
    sessionId: validSessionId,
    userId: user?.id,
    partnerUserId,
    enabled: mediaEnabled,
    onEvent: (event) => eventHandlerRef.current(event),
    onSessionExpired: recoverExpiredSession,
  });

  useEffect(() => {
    poseEventRef.current = poseEvent;
  }, [poseEvent]);

  useEffect(() => {
    sharedSceneEventRef.current = sharedSceneEvent;
  }, [sharedSceneEvent]);

  useEffect(() => {
    lightingModeEventRef.current = lightingModeEvent;
  }, [lightingModeEvent]);

  useEffect(() => { companionEventRef.current = companionEvent; }, [companionEvent]);

  useEffect(() => {
    tapReactionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    tapReactionTimersRef.current.clear();
    setTapReactionPetIds(new Set());
    if (!validSessionId) {
      setCapturedCompanionsByShot({});
      return;
    }
    try {
      const stored = sessionStorage.getItem(`booth_captured_companions:${validSessionId}`);
      setCapturedCompanionsByShot(stored ? JSON.parse(stored) as Record<number, BoothCompanionSnapshot[]> : {});
    } catch {
      setCapturedCompanionsByShot({});
    }
  }, [validSessionId]);

  useEffect(() => {
    setCompanionEvent(null);
    companionEventRef.current = null;
    if (!validSessionId) return;
    try {
      const stored = sessionStorage.getItem(`booth_companions:${validSessionId}`);
      if (!stored) return;
      const parsed = JSON.parse(stored) as BoothCompanionStateEvent;
      if (
        parsed.type === 'companion_state_changed' && parsed.sessionId === validSessionId
        && Array.isArray(parsed.companions) && typeof parsed.eventId === 'string'
        && typeof parsed.selectedBy === 'string' && Number.isFinite(parsed.selectedAt)
        && Number.isFinite(parsed.version) && parsed.version >= 0
      ) {
        setCompanionEvent({ ...parsed, companions: normalizeBoothCompanionPlacements(parsed.companions) });
      }
    } catch { /* empty is the safe fallback */ }
  }, [validSessionId]);

  useEffect(() => {
    if (!validSessionId || !companionEvent || companionEvent.sessionId !== validSessionId) return;
    try { sessionStorage.setItem(`booth_companions:${validSessionId}`, JSON.stringify(companionEvent)); } catch { /* optional */ }
  }, [companionEvent, validSessionId]);

  useEffect(() => {
    if (!mediaRoom.remoteConnected || !companionEvent || companionEvent.sessionId !== validSessionId) return;
    void mediaRoom.mediaRef.current?.sendReliableEvent(companionEvent).catch(() => undefined);
  }, [companionEvent, mediaRoom.mediaRef, mediaRoom.remoteConnected, validSessionId]);

  useEffect(() => {
    setPoseEvent(null);
    poseEventRef.current = null;
    if (!validSessionId) return;
    try {
      const stored = sessionStorage.getItem(`booth_pose:${validSessionId}`);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<BoothPoseEvent>;
      if (
        parsed.type === 'pose_selected'
        && parsed.sessionId === validSessionId
        && isCouplePoseId(parsed.poseId)
        && typeof parsed.eventId === 'string'
        && typeof parsed.selectedBy === 'string'
        && typeof parsed.selectedAt === 'number'
        && Number.isFinite(parsed.selectedAt)
        && typeof parsed.version === 'number'
        && Number.isFinite(parsed.version)
        && parsed.version >= 0
      ) {
        setPoseEvent(parsed as BoothPoseEvent);
      }
    } catch {
      // Session storage is a reconnect convenience; Free remains the safe default.
    }
  }, [validSessionId]);

  useEffect(() => {
    if (!validSessionId || !poseEvent || poseEvent.sessionId !== validSessionId) return;
    try {
      sessionStorage.setItem(`booth_pose:${validSessionId}`, JSON.stringify(poseEvent));
    } catch {
      // Reliable LiveKit propagation continues even when storage is unavailable.
    }
  }, [poseEvent, validSessionId]);

  useEffect(() => {
    if (!mediaRoom.remoteConnected || !poseEvent || poseEvent.sessionId !== validSessionId) return;
    void mediaRoom.mediaRef.current?.sendReliableEvent(poseEvent).catch(() => undefined);
  }, [mediaRoom.mediaRef, mediaRoom.remoteConnected, poseEvent, validSessionId]);

  useEffect(() => {
    setSharedSceneEvent(null);
    sharedSceneEventRef.current = null;
    if (!validSessionId) return;
    try {
      const stored = sessionStorage.getItem(`booth_shared_scene:${validSessionId}`);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<BoothSharedSceneEvent>;
      if (
        parsed.type === 'scene_selected'
        && parsed.sessionId === validSessionId
        && isBoothSharedSceneId(parsed.sceneId)
        && typeof parsed.eventId === 'string'
        && typeof parsed.selectedBy === 'string'
        && typeof parsed.selectedAt === 'number'
        && Number.isFinite(parsed.selectedAt)
        && typeof parsed.version === 'number'
        && Number.isFinite(parsed.version)
        && parsed.version >= 0
      ) {
        setSharedSceneEvent(parsed as BoothSharedSceneEvent);
      }
    } catch {
      // Classic remains the safe fallback when session storage is unavailable.
    }
  }, [validSessionId]);

  useEffect(() => {
    if (!validSessionId || !sharedSceneEvent || sharedSceneEvent.sessionId !== validSessionId) return;
    try {
      sessionStorage.setItem(`booth_shared_scene:${validSessionId}`, JSON.stringify(sharedSceneEvent));
    } catch {
      // Reliable LiveKit propagation remains available without storage.
    }
  }, [sharedSceneEvent, validSessionId]);

  useEffect(() => {
    if (!mediaRoom.remoteConnected || !sharedSceneEvent || sharedSceneEvent.sessionId !== validSessionId) return;
    void mediaRoom.mediaRef.current?.sendReliableEvent(sharedSceneEvent).catch(() => undefined);
  }, [mediaRoom.mediaRef, mediaRoom.remoteConnected, sharedSceneEvent, validSessionId]);

  useEffect(() => {
    setLightingModeEvent(null);
    lightingModeEventRef.current = null;
    if (!validSessionId) return;
    try {
      const stored = sessionStorage.getItem(`booth_lighting_mode:${validSessionId}`);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<BoothLightingModeEvent>;
      if (
        parsed.type === 'lighting_mode_selected'
        && parsed.sessionId === validSessionId
        && typeof parsed.enabled === 'boolean'
        && typeof parsed.eventId === 'string'
        && typeof parsed.selectedBy === 'string'
        && typeof parsed.selectedAt === 'number'
        && Number.isFinite(parsed.selectedAt)
        && typeof parsed.version === 'number'
        && Number.isFinite(parsed.version)
        && parsed.version >= 0
      ) setLightingModeEvent(parsed as BoothLightingModeEvent);
    } catch {
      // Automatic matching remains the conservative default.
    }
  }, [validSessionId]);

  useEffect(() => {
    if (!validSessionId || !lightingModeEvent || lightingModeEvent.sessionId !== validSessionId) return;
    try {
      sessionStorage.setItem(`booth_lighting_mode:${validSessionId}`, JSON.stringify(lightingModeEvent));
    } catch {
      // Reliable peer sync remains available without storage.
    }
  }, [lightingModeEvent, validSessionId]);

  useEffect(() => {
    if (!mediaRoom.remoteConnected || !lightingModeEvent || lightingModeEvent.sessionId !== validSessionId) return;
    void mediaRoom.mediaRef.current?.sendReliableEvent(lightingModeEvent).catch(() => undefined);
  }, [lightingModeEvent, mediaRoom.mediaRef, mediaRoom.remoteConnected, validSessionId]);

  const captureViewportStorageKey = validSessionId ? `booth_capture_viewport:${validSessionId}` : null;
  const captureViewportModeLocked = Boolean(
    clockActive
      || session?.status === 'capturing'
      || session?.status === 'review'
      || session?.status === 'finalizing'
      || session?.status === 'completed',
  );

  useEffect(() => {
    if (!captureViewportStorageKey) {
      setCaptureViewportMode(DEFAULT_CAPTURE_VIEWPORT_MODE);
      return;
    }
    try {
      const stored = sessionStorage.getItem(captureViewportStorageKey);
      setCaptureViewportMode(stored === 'mobile' ? 'mobile' : DEFAULT_CAPTURE_VIEWPORT_MODE);
    } catch {
      setCaptureViewportMode(DEFAULT_CAPTURE_VIEWPORT_MODE);
    }
  }, [captureViewportStorageKey]);

  const broadcastCaptureViewportMode = useCallback((mode: CaptureViewportMode) => {
    if (!isHost || captureViewportModeLocked || !user?.id) return;
    setCaptureViewportMode(mode);
    try {
      if (captureViewportStorageKey) sessionStorage.setItem(captureViewportStorageKey, mode);
    } catch {
      // Private browsing storage is optional; LiveKit remains authoritative.
    }
    void mediaRoom.mediaRef.current?.sendReliableEvent({
      type: 'capture_viewport_mode',
      userId: user.id,
      captureViewportMode: mode,
    });
  }, [captureViewportModeLocked, captureViewportStorageKey, isHost, mediaRoom.mediaRef, user?.id]);

  useEffect(() => {
    if (!isHost || !mediaRoom.remoteConnected || !user?.id) return;
    void mediaRoom.mediaRef.current?.sendReliableEvent({
      type: 'capture_viewport_mode',
      userId: user.id,
      captureViewportMode,
    });
  }, [captureViewportMode, isHost, mediaRoom.mediaRef, mediaRoom.remoteConnected, user?.id]);

  useEffect(() => {
    if (!isHost || !mediaRoom.remoteConnected || !user?.id || !sameSpaceEnabledOverride && session?.sameSpaceEnabled == null) return;
    void mediaRoom.mediaRef.current?.sendReliableEvent({
      type: 'same_space_mode_preview',
      userId: user.id,
      sameSpaceEnabled,
    });
  }, [isHost, mediaRoom.mediaRef, mediaRoom.remoteConnected, sameSpaceEnabled, sameSpaceEnabledOverride, session?.sameSpaceEnabled, user?.id]);
  const retryMediaConnectionRef = useRef(mediaRoom.retryMediaConnection);
  retryMediaConnectionRef.current = mediaRoom.retryMediaConnection;

  // Couple-auth must never reuse guest-link LiveKit JWTs for the same session id.
  useEffect(() => {
    if (!validSessionId || isGuestLinkMode) return;
    try {
      clearGuestLinkTokenCache(validSessionId, sessionStorage);
    } catch {
      // private mode
    }
  }, [validSessionId, isGuestLinkMode, user?.id]);

  // Safe deployment / auth diagnostics for desktop vs phone mismatch.
  useEffect(() => {
    if (!import.meta.env.DEV && !mediaRoom.tokenError) return;
    let projectRef: string | undefined;
    try {
      projectRef = new URL(import.meta.env.VITE_SUPABASE_URL || '').hostname.split('.')[0];
    } catch {
      projectRef = undefined;
    }
    console.info('[couple-booth][env]', {
      build: BUILD_INFO,
      origin: window.location.origin,
      supabaseProjectRef: projectRef,
      authUserIdMasked: maskId(user?.id),
      authSessionPresent: Boolean(user?.id),
      guestMode: isGuestLinkMode,
      boothSessionIdMasked: maskId(validSessionId),
      tokenStatus: mediaRoom.tokenError?.status,
      tokenCode: mediaRoom.tokenError?.code,
      connectionKey: mediaRoom.connectionKey,
    });
  }, [
    isGuestLinkMode,
    mediaRoom.connectionKey,
    mediaRoom.tokenError,
    user?.id,
    validSessionId,
  ]);

  // If token failed because the invite was not yet accepted, retry after status advances.
  // Never create a new session — keep the same session id. Auth/401 codes never auto-retry.
  useEffect(() => {
    if (!mediaEnabled) return;
    if (mediaRoom.tokenError?.code !== 'SESSION_NOT_MEDIA_ELIGIBLE') return;
    if (!['accepted', 'connecting', 'ready', 'capturing'].includes(session?.status ?? '')) return;
    const timer = window.setTimeout(() => {
      void retryMediaConnectionRef.current();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [mediaEnabled, mediaRoom.tokenError?.code, session?.status]);

  // Host waiting on invited: poll as a Realtime backup so guest accept is noticed.
  useEffect(() => {
    if (!session || !user?.id || !isValidBoothSessionId(session.id)) return;
    if (session.status !== 'invited' || session.hostUserId !== user.id) return;
    const targetId = session.id;
    const tick = window.setInterval(() => {
      void getBoothSession(targetId)
        .then((next) => {
          if (next && next.id === targetId && next.status !== 'invited') {
            setSession(next);
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(tick);
  }, [session?.id, session?.status, session?.hostUserId, user?.id]);

  useEffect(() => {
    // Authenticated deep links should still show the lobby's explicit invite
    // confirmation. Capability-token guests retain their existing direct flow.
    if (isGuestLinkMode || !session || !user?.id) return;
    if (session.status === 'invited' && session.guestUserId === user.id) {
      navigate('/booth', { replace: true });
    }
  }, [isGuestLinkMode, navigate, session?.guestUserId, session?.status, user?.id]);

  const companionPlacements = companionEvent && companionEvent.sessionId === validSessionId
    ? companionEvent.companions
    : [];
  const baseBoothCompanions = useMemo(
    () => couplePetsToBoothCompanionSnapshots(pets, companionPlacements),
    [pets, companionPlacements],
  );

  const capture = useSynchronizedCapture({
    media: mediaRoom.mediaRef.current,
    sessionId: validSessionId ?? '',
    coupleId: profile?.coupleId ?? session?.coupleId ?? '',
    userId: user?.id ?? '',
    mediaExpiresAt: session?.mediaExpiresAt,
    sameSpaceEnabled,
    captureViewportMode,
    sameSpaceCaptureRef,
    resolveShutterCompanions: () => baseBoothCompanions.map((companion) =>
      resolveBoothCompanionPresentation(companion, 'shutter')),
    onCompanionsCaptured: (index, companions) => {
      setCapturedCompanionsByShot((current) => {
        const next = { ...current, [index]: companions };
        if (validSessionId) {
          try { sessionStorage.setItem(`booth_captured_companions:${validSessionId}`, JSON.stringify(next)); } catch { /* optional */ }
        }
        return next;
      });
    },
    onShotProgress: (index) => setShotIndex(index),
    onAllShotsDone: () => {
      // Review is server-authoritative: it starts only after every host/guest
      // pair is stored with the same capture id.
      setCaptureHint(t('내 8장을 업로드했습니다. 상대의 업로드를 확인하는 중이에요.'));
    },
    onError: (error) => {
      if (error.message === 'PROTOCOL_MISMATCH') {
        setPageError('App/web protocol mismatch. Refresh this page or update the app.');
        return;
      }
      if (error.message === 'MEDIA_WINDOW_TOO_SHORT' || error.message === 'MEDIA_EXPIRED') {
        setCaptureHint(t('촬영 시간이 끝났습니다. 업로드가 완료된 컷만 검토할 수 있어요.'));
        return;
      }
      // Sync timing misses are recoverable — never promote to session fatal / equipment copy.
      if (isCaptureSyncErrorCode(error.message)) {
        return;
      }
      setPageError(error.message);
    },
    onSyncNotice: (notice) => setCaptureSyncNotice(notice),
    onProtocolMismatch: () =>
      setPageError('App/web protocol mismatch. Refresh this page or update the app.'),
  });

  const countdownCompanionReaction = boothCompanionReactionForCountdown(capture.countdown);
  const boothCompanions = useMemo(
    () => baseBoothCompanions.map((companion) => resolveBoothCompanionPresentation(
      companion,
      resolveBoothCompanionReaction([
        countdownCompanionReaction,
        tapReactionPetIds.has(companion.id) ? 'tap' : 'idle',
        capture.companionReaction,
      ]),
    )),
    [baseBoothCompanions, capture.companionReaction, countdownCompanionReaction, tapReactionPetIds],
  );

  const triggerCompanionTapReaction = (petId: string) => {
    if (capture.countdown != null || capture.companionReaction !== 'idle') return;
    const existing = tapReactionTimersRef.current.get(petId);
    if (existing != null) window.clearTimeout(existing);
    setTapReactionPetIds((current) => new Set(current).add(petId));
    const timer = window.setTimeout(() => {
      tapReactionTimersRef.current.delete(petId);
      setTapReactionPetIds((current) => {
        const next = new Set(current);
        next.delete(petId);
        return next;
      });
    }, 280);
    tapReactionTimersRef.current.set(petId, timer);
  };

  useEffect(() => {
    eventHandlerRef.current = (event) => {
      if (event.type === 'ready') {
        if (event.userId === partnerUserId && mediaRoom.remoteConnected) {
          setRemoteReady(true);
        }
        capture.handleEvent(event);
        return;
      }
      if (event.type === 'pose_selected') {
        if (!validSessionId) return;
        if (event.selectedBy !== session?.hostUserId && event.selectedBy !== session?.guestUserId) return;
        setPoseEvent((current) => {
          const next = applyBoothPoseEvent(current, event, validSessionId);
          poseEventRef.current = next;
          return next;
        });
        return;
      }
      if (event.type === 'scene_selected') {
        if (!validSessionId) return;
        if (event.selectedBy !== session?.hostUserId && event.selectedBy !== session?.guestUserId) return;
        setSharedSceneEvent((current) => {
          const next = applyBoothSharedSceneEvent(current, event, validSessionId);
          sharedSceneEventRef.current = next;
          return next;
        });
        return;
      }
      if (event.type === 'lighting_mode_selected') {
        if (!validSessionId) return;
        if (event.selectedBy !== session?.hostUserId && event.selectedBy !== session?.guestUserId) return;
        setLightingModeEvent((current) => {
          const next = applyBoothLightingModeEvent(current, event, validSessionId);
          lightingModeEventRef.current = next;
          return next;
        });
        return;
      }
      if (event.type === 'companion_state_changed') {
        if (!validSessionId || event.sessionId !== validSessionId) return;
        if (event.selectedBy !== session?.hostUserId && event.selectedBy !== session?.guestUserId) return;
        setCompanionEvent((current) => {
          const next = isNewerBoothCompanionStateEvent(event, current) ? event : current;
          companionEventRef.current = next;
          return next;
        });
        return;
      }
      if (event.type === 'positions_preview') {
        setSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            leftParticipantId: event.leftParticipantId,
            rightParticipantId: event.rightParticipantId,
            participantTransforms: event.participantTransforms ?? {},
          };
        });
        if (event.participantTransforms) {
          setLiveTransforms(event.participantTransforms);
        } else {
          setLiveTransforms({});
        }
        return;
      }
      if (event.type === 'transform_preview') {
        setLiveTransforms((prev) => ({
          ...prev,
          [event.userId]: {
            offsetX: event.offsetX,
            offsetY: event.offsetY,
            scale: event.scale,
          },
        }));
        return;
      }
      if (event.type === 'background_preview' && isSameSpaceBackgroundKey(event.backgroundKey)) {
        const nextBg = sameSpaceBackgroundFromKey(event.backgroundKey);
        setSameSpaceMeta((prev) => ({ ...prev, background: nextBg }));
        setSession((prev) => (prev ? { ...prev, sameSpaceBackground: nextBg } : prev));
        return;
      }
      if (event.type === 'color_mode_preview') {
        setColorMode(event.colorMode);
        setSession((prev) => (prev ? { ...prev, colorMode: event.colorMode } : prev));
        return;
      }
      if (event.type === 'scene_span_preview') {
        // Live/capture are two_cell fixed — ignore peer span echoes entirely.
        // Review uses a separate local draft SoT (reviewSceneSpanMode).
        return;
      }
      if (event.type === 'capture_viewport_mode') {
        if (event.userId !== session?.hostUserId) return;
        setCaptureViewportMode(event.captureViewportMode);
        try {
          if (captureViewportStorageKey) sessionStorage.setItem(captureViewportStorageKey, event.captureViewportMode);
        } catch {
          // Private browsing storage is optional.
        }
        return;
      }
      if (event.type === 'same_space_mode_preview') {
        if (event.userId !== session?.hostUserId) return;
        setSameSpaceEnabledOverride(event.sameSpaceEnabled);
        try {
          if (validSessionId) sessionStorage.setItem(`booth_same_space:${validSessionId}`, event.sameSpaceEnabled ? '1' : '0');
        } catch {
          // Private browsing storage is optional.
        }
        return;
      }
      capture.handleEvent(event);
    };
  }, [capture, captureViewportStorageKey, partnerUserId, session?.guestUserId, session?.hostUserId, validSessionId]);

  useEffect(() => {
    if (!validSessionId) {
      setSameSpaceEnabledOverride(null);
      return;
    }
    try {
      const stored = sessionStorage.getItem(`booth_same_space:${validSessionId}`);
      setSameSpaceEnabledOverride(stored === '1' ? true : stored === '0' ? false : null);
    } catch {
      setSameSpaceEnabledOverride(null);
    }
  }, [validSessionId]);

  useEffect(() => {
    if (!session || sameSpaceEnabledOverride === null) return;
    if (session.status === 'review' || session.status === 'finalizing' || session.status === 'completed') {
      setSameSpaceEnabledOverride(null);
    }
  }, [session?.status, sameSpaceEnabledOverride]);

  useEffect(() => {
    setLocalReady(false);
    setRemoteReady(false);
    setPrepareRequested(false);
    setReadyBusy(false);
  }, [validSessionId]);

  useEffect(() => {
    // A real participant leave/rejoin starts a new readiness handshake. Keep
    // the camera/media room alive; only the capture barrier is reset.
    const reset = resetReadyBarrierOnParticipantLifecycle(
      mediaRoom.remoteConnected,
      mediaRoom.remoteParticipantIdentity,
    );
    if (reset) {
      setLocalReady(false);
      setRemoteReady(false);
      setPrepareRequested(false);
      setReadyBusy(false);
      if (mediaRoom.localMediaReady) {
        void mediaRoom.disableLocalMedia();
      }
    }
  }, [
    mediaRoom.disableLocalMedia,
    mediaRoom.localMediaReady,
    mediaRoom.remoteConnected,
    mediaRoom.remoteParticipantIdentity,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const caps = await probeBoothPositionCapabilities();
      if (cancelled) return;
      if (!caps?.positions || !caps.swap) {
        setPositionRpcReady(false);
        if (import.meta.env.DEV) {
          setPositionDevHint('migration missing: couple_booth_position RPCs');
        }
        return;
      }
      setPositionRpcReady(true);
      setPositionDevHint(null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session?.participantTransforms) return;
    setLiveTransforms(session.participantTransforms);
  }, [session?.id, session?.positionRevision, session?.participantTransforms]);

  useEffect(() => {
    if (!session) return;
    setFrameId((session.selectedFrameId as BoothFrameId) ?? 'classic');
    setSlotCrops(
      Object.fromEntries(
        Object.entries(session.selectedSlotCrops ?? {}).map(([key, value]) => [Number(key), value]),
      ),
    );
    let cancelled = false;
    const hydrate = async () => {
      let background = session.sameSpaceBackground ?? DEFAULT_SAME_SPACE_BACKGROUND;
      if (background.type === 'image' && background.storagePath) {
        if (!backgroundPathBelongsToSession(background.storagePath, session.coupleId, session.id)) {
          background = DEFAULT_SAME_SPACE_BACKGROUND;
        } else {
          const signed = await signedBoothUrl(background.storagePath, { soft: true });
          if (cancelled) return;
          let frontUrl: string | undefined;
          const frontPath = ourRoomFrontPlatePath(background);
          if (frontPath) frontUrl = await signedBoothUrl(frontPath, { soft: true });
          background = { ...background, url: signed ?? undefined, frontUrl };
        }
      }
      const serverSpan = parseBoothSceneSpanMode(
        session.sameSpaceSceneSpanMode,
        LIVE_CAPTURE_SCENE_SPAN_MODE,
      );
      const serverRev = session.compositionRevision ?? 0;
      const isReview = session.status === 'review';
      // Live + capture meta is always two_cell — never hydrate one_cell into the stage.
      setSameSpaceMeta((prev) => ({
        background,
        frontSlot: session.sameSpaceFrontSlot ?? 'left',
        soloLayout: session.sameSpaceSoloLayout ?? 'half',
        revision: serverRev,
        sceneSpanMode: isReview
          ? (reviewSpanDirtyRef.current ? prev.sceneSpanMode : serverSpan)
          : LIVE_CAPTURE_SCENE_SPAN_MODE,
        slotManualOffsets: session.sameSpaceSlotManualOffsets ?? prev.slotManualOffsets ?? {},
        slotSubjectPlacements: session.sameSpaceSlotSubjectPlacements ?? prev.slotSubjectPlacements ?? {},
      }));
      // Review packing draft hydrates once per session — local dirty wins afterward.
      if (isReview && reviewSpanHydratedSessionRef.current !== session.id) {
        reviewSpanHydratedSessionRef.current = session.id;
        if (!reviewSpanDirtyRef.current) {
          setReviewSceneSpanMode(serverSpan);
        }
      }
      sceneSpanAppliedServerRevRef.current = serverRev;
      setColorMode(parseBoothColorMode(session.colorMode));
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [
    session?.id,
    session?.selectedFrameId,
    session?.selectedSlotCrops,
    session?.sameSpaceSlotManualOffsets,
    session?.sameSpaceSlotSubjectPlacements,
    session?.sameSpaceSceneSpanMode,
    session?.sameSpaceBackground,
    session?.sameSpaceFrontSlot,
    session?.sameSpaceSoloLayout,
    session?.compositionRevision,
  ]);

  // Realtime session updates carry the database-issued schedule to both
  // participants. This is intentionally separate from LiveKit data packets.
  useEffect(() => {
    // Do not resurrect a pending schedule while waiting for a new readiness
    // barrier. A schedule is valid only after the server capture clock is
    // active and this browser has observed both persisted readiness flags.
    if (!clockActive || !bothReady || !mediaRoom.remoteConnected) return;
    if (!session?.currentCaptureId || !session.currentCaptureAt) return;
    void capture.scheduleServerCapture({
      captureId: session.currentCaptureId,
      shotIndex: session.currentShotIndex,
      captureAt: session.currentCaptureAt,
    });
  }, [
    bothReady,
    capture,
    clockActive,
    mediaRoom.remoteConnected,
    session?.currentCaptureAt,
    session?.currentCaptureId,
    session?.currentShotIndex,
  ]);

  useEffect(() => {
    if (session?.status !== 'completed' || completionCallbackSent.current) return;
    if (!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
    completionCallbackSent.current = true;
    window.location.assign(`lovebridge://couple-booth/result?sessionId=${encodeURIComponent(session.id)}`);
  }, [session?.id, session?.status]);

  const reload = useCallback(async () => {
    if (!validSessionId) return;
    // Always abort the previous load, then create a fresh controller.
    // Reload photos must never reuse an already-aborted AbortController.
    reloadAbortRef.current?.abort();
    const controller = new AbortController();
    reloadAbortRef.current = controller;
    const [nextSession, nextShots] = await Promise.all([getBoothSession(validSessionId), listBoothShots(validSessionId)]);
    if (controller.signal.aborted) return;
    setSession(nextSession);
    setShots(nextShots);
    setSelected(nextSession?.selectedShotIndexes ?? []);
    if (nextShots.length && nextSession) {
      const bundle = await loadBoothReviewUrls({
        shots: nextShots,
        hostUserId: nextSession.hostUserId,
        guestUserId: nextSession.guestUserId,
        sessionKey: nextSession.id.slice(0, 8),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setUrls(bundle.urls);
      setAssetLoadError(bundle.errorMessage);
    } else if (!controller.signal.aborted) {
      setUrls({});
      setAssetLoadError(null);
    }
    if (nextSession?.finalImagePath) {
      const url = await signedBoothUrl(nextSession.finalImagePath, {
        signal: controller.signal,
        soft: true,
        sessionKey: nextSession.id.slice(0, 8),
        role: 'shared',
        assetStatus: 'final',
      });
      if (controller.signal.aborted) return;
      setFinalUrl(url ?? null);
      if (!url) {
        setAssetLoadError((prev) => prev ?? 'Final booth image could not be loaded. Tap Reload photos to try again.');
      }
    }
  }, [validSessionId]);

  useEffect(() => {
    if (!user || !validSessionId) return;
    let unsub: (() => void) | undefined;
    void reload().catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setPageError(err instanceof Error ? err.message : 'Load failed');
    });
    void subscribeBoothSession(validSessionId, () => {
      void reload().catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAssetLoadError(err instanceof Error ? err.message : 'Photo reload failed');
      });
    }).then((fn) => {
      unsub = fn;
    });
    return () => {
      reloadAbortRef.current?.abort();
      unsub?.();
    };
  }, [user, validSessionId, reload]);

  // beforeunload while capturing
  useEffect(() => {
    if (session?.status !== 'capturing' && session?.status !== 'ready' && session?.status !== 'connecting') {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [session?.status]);

  useEffect(() => {
    // Live/capture never persist span — Review entry host-only persist of review draft.
    if (!session || session.status !== 'review') return;
    if (!isHost) return;
    if (!sameSpaceEnabled) return;
    if (reviewSpanDirtyRef.current) return;
    if (session.sameSpaceSceneSpanMode === reviewSceneSpanMode) return;
    const nextMeta: SameSpaceCompositionMeta = {
      ...sameSpaceMeta,
      sceneSpanMode: reviewSceneSpanMode,
    };
    void saveComposition(frameId, slotCrops, nextMeta);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on review entry / span drift
  }, [sameSpaceEnabled, session?.status, session?.sameSpaceSceneSpanMode, reviewSceneSpanMode, isHost]);

  useEffect(() => {
    if (!clockActive || !session?.mediaExpiresAt || session.status === 'review') {
      if (!clockActive) setRemainingSec(null);
      expiryHandled.current = false;
      return;
    }
    const tick = () => {
      const left = mediaRemainingSeconds(session.mediaExpiresAt);
      setRemainingSec(left);
      if (left <= 20 && left > 0) setCaptureHint(t('촬영 시간이 얼마 남지 않았어요.'));
      if (left <= 0 && !expiryHandled.current) {
        expiryHandled.current = true;
        setCaptureHint(t('촬영 시간이 끝났습니다. 두 사람의 업로드가 모두 확인될 때만 Review로 이동합니다.'));
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [clockActive, session?.mediaExpiresAt, session?.status, sessionId, mediaRoom]);

  const room: Room | null = useMemo(() => {
    const media = mediaRoom.mediaRef.current;
    if (media instanceof WebLiveKitCoupleBoothMediaService) return media.getRoom();
    return null;
  }, [mediaRoom.connectionState, mediaRoom.remoteConnected, mediaRoom.trackEpoch]);

  const candidates = useMemo(() => {
    if (!session) return [];
    return buildCandidates(shots, session.hostUserId, session.guestUserId);
  }, [shots, session]);
  const activeFrame = BOOTH_FRAME_OPTIONS.find((option) => option.id === frameId) ?? BOOTH_FRAME_OPTIONS[0];

  useEffect(() => {
    if (!session) return;
    if (session.status !== 'review' && session.status !== 'finalizing' && session.status !== 'completed') return;
    setCaptureSyncNotice(null);
    // Always drop recoverable capture timing from Review fatal state.
    if (pageError && isCaptureSyncErrorCode(pageError)) {
      console.info('[couple-booth][review] clearing recoverable capture warning', pageError);
      setPageError(null);
    }
  }, [session?.status, candidates.length, pageError]);

  if (loading) {
    return (
      <div className="booth-entry-shell" aria-busy="true">
        <p className="booth-entry-mark">jongjong</p>
        <p className="booth-entry-title">촬영 준비 중…</p>
        <div className="booth-entry-spinner" aria-hidden="true" />
      </div>
    );
  }

  if (!validSessionId) {
    return (
      <div className="booth-entry-shell">
        <p className="booth-entry-mark">jongjong</p>
        <p className="booth-entry-title">촬영실을 열 수 없어요</p>
        <p className="booth-entry-detail">세션 정보가 올바르지 않습니다. 다시 시작해 주세요.</p>
        <Link className="btn btn-secondary booth-entry-retry" to="/booth">다시 시작</Link>
      </div>
    );
  }

  if (!user) {
    sessionStorage.setItem('booth_return_to', `/booth/${validSessionId}`);
    return <Navigate to="/login" replace state={{ from: `/booth/${validSessionId}` }} />;
  }

  if (!session) {
    return (
      <div className="booth-entry-shell" aria-busy={!pageError}>
        <p className="booth-entry-mark">jongjong</p>
        <p className="booth-entry-title">{pageError ? '촬영실을 찾을 수 없어요' : '촬영 준비 중…'}</p>
        {pageError ? <p className="booth-entry-detail">{pageError}</p> : <div className="booth-entry-spinner" aria-hidden="true" />}
        <Link className="btn btn-secondary booth-entry-retry" to="/booth">다시 시작</Link>
      </div>
    );
  }

  if (!isHost && !isGuest) {
    return (
      <div className="booth-entry-shell">
        <p className="booth-entry-mark">jongjong</p>
        <p className="booth-entry-title">참여할 수 없는 촬영실이에요</p>
        <p className="booth-entry-detail">이 세션의 참가자가 아닙니다.</p>
        <Link className="btn btn-secondary booth-entry-retry" to="/booth">다시 시작</Link>
      </div>
    );
  }

  const onStartCaptureClock = async () => {
    if (
      !planCaptureAutoStart({
        isHost,
        partnerConnected: mediaRoom.remoteConnected,
        localReady,
        remoteReady,
        captureStarted: clockActive,
        startInFlight: captureStartLock.current,
      }).startClock
    ) {
      return;
    }
    captureStartLock.current = true;
    setBusy(true);
    setPageError(null);
    try {
      // Starts the 90s media window only. Shot scheduling stays user-driven.
      const started = await startBoothCapture(sessionIdForRequest());
      setSession(started);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Start failed';
      if (message.includes('MEDIA_WINDOW_TOO_SHORT') || message.includes('MEDIA_EXPIRED')) {
        setCaptureHint('촬영 시간이 끝났습니다. 두 사람의 업로드를 확인하고 있어요.');
        return;
      }
      setPageError(message);
    } finally {
      captureStartLock.current = false;
      setBusy(false);
    }
  };
  const onScheduleShot = async () => {
    if (
      !canScheduleManualShot({
        isHost,
        partnerConnected: mediaRoom.remoteConnected,
        bothReady,
        clockActive,
        startInFlight: captureStartLock.current,
        captureBusy: Boolean(capture.busyCaptureId),
        pendingCaptureAt: session?.currentCaptureAt,
        canScheduleNext: canScheduleNextCapture(session?.mediaExpiresAt),
      })
    ) {
      return;
    }
    captureStartLock.current = true;
    setBusy(true);
    setPageError(null);
    try {
      const next = Math.min(TOTAL_SHOTS, Math.max(1, (session?.currentShotIndex ?? 0) + 1));
      const scheduled = await scheduleBoothShot(sessionIdForRequest(), next);
      setSession(scheduled);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Start failed';
      if (message.includes('MEDIA_WINDOW_TOO_SHORT') || message.includes('MEDIA_EXPIRED')) {
        setCaptureHint('촬영 시간이 끝났습니다. 두 사람의 업로드를 확인하고 있어요.');
        return;
      }
      setPageError(message);
    } finally {
      captureStartLock.current = false;
      setBusy(false);
    }
  };

  const onReady = async () => {
    if (
      !user
      || !session
      || !mediaRoom.remoteConnected
      || (
        mediaRoom.mediaState !== 'connected'
        && !isBoothMediaErrorState(mediaRoom.mediaState)
      )
      || (
        !mediaRoom.localMediaReady
        && !canInitializeLocalMedia({
          roomConnected: mediaRoom.connectionState === 'connected',
          userPressedPrepare: true,
          localMediaReady: false,
        })
      )
      || clockActive
      || localReady
      || readyBusy
    ) {
      return;
    }
    setReadyBusy(true);
    setPrepareRequested(true);
    setPageError(null);
    try {
      // USER_READY is only a request. The barrier is updated after the real
      // camera/microphone tracks have been created and published.
      const mediaReady = mediaRoom.localMediaReady || await mediaRoom.enableLocalMedia();
      if (!mediaReady) {
        setPrepareRequested(false);
        return;
      }

      // Persist MEDIA_READY, then announce it over the existing reliable
      // LiveKit data channel. The host remains the only writer allowed to
      // start the server capture clock.
      const nextSession = await setBoothReady(session.id, isHost);
      setSession(nextSession);
      setLocalReady(true);
      await capture.announceReady();
    } catch (error) {
      setPrepareRequested(false);
      setPageError(error instanceof Error ? error.message : 'ROOM_READY_FAILED');
    } finally {
      setReadyBusy(false);
    }
  };

  const onLeave = async (confirmExit = true) => {
    if (confirmExit && !window.confirm(t('촬영방을 나갈까요? 현재 촬영 또는 저장 중인 결과가 완료되지 않을 수 있어요.'))) return;
    await mediaRoom.disconnect();
    if (isGuestLinkMode && validSessionId) {
      sessionStorage.removeItem(`booth_guest_livekit:${validSessionId}`);
      sessionStorage.removeItem(`booth_guest_mode:${validSessionId}`);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      navigate('/booth/guest-done', { replace: true });
      return;
    }
    await cancelBoothSession(sessionIdForRequest(), 'user_left_web').catch(() => undefined);
    navigate('/booth', { replace: true });
  };

  const onHome = () => {
    const confirmExit = Boolean(
      clockActive
        || session?.status === 'capturing'
        || session?.status === 'finalizing'
        || session?.status === 'review',
    );
    void onLeave(confirmExit);
  };

  const persistSelection = async (next: number[]) => {
    if (!session) return;
    const previous = selected;
    const previousRevision = session.selectionRevision ?? 0;
    setSelected(next);
    try {
      const updated = await updateBoothSelection(session.id, next, previousRevision);
      setSession(updated);
      setSelected(updated.selectedShotIndexes);
    } catch (error) {
      setSelected(previous);
      const message = error instanceof Error ? error.message : 'SELECTION_SAVE_FAILED';
      if (message.includes('SELECTION_REVISION_CONFLICT')) {
        void reload();
        setPageError('상대가 선택을 바꿨어요. 최신 상태를 불러왔어요.');
        return;
      }
      setPageError(message);
    }
  };

  const onToggle = (index: number) => {
    if (!session || session.status !== 'review') return;
    const currentPosition = selected.indexOf(index);
    let next: number[];
    if (currentPosition >= 0) {
      next = selected.filter((value) => value !== index);
      setActiveSlot(Math.min(currentPosition, Math.max(0, next.length)));
    } else if (selected.length < REQUIRED_SELECTED_SHOTS) {
      next = [...selected, index];
      setActiveSlot(Math.min(next.length, REQUIRED_SELECTED_SHOTS - 1));
    } else {
      const target = Math.min(activeSlot, REQUIRED_SELECTED_SHOTS - 1);
      next = [...selected];
      next[target] = index;
      setActiveSlot(target);
    }
    void persistSelection(next);
  };

  const saveComposition = async (
    nextFrame: BoothFrameId,
    nextCrops: Record<number, BoothCropTransform>,
    nextMeta: SameSpaceCompositionMeta = sameSpaceMeta,
  ) => {
    if (!session || session.status !== 'review') return;
    if (!isHost && !isGuest) return;
    try {
      const persistBackground = (() => {
        const background = nextMeta.background;
        if (background.type === 'image') {
          return {
            ...background,
            // Persist path only — signed URLs are re-issued on load.
            url: undefined,
          };
        }
        return background;
      })();
      const packed = packSlotCropsWithMeta(nextCrops, {
        ...nextMeta,
        background: persistBackground,
        revision: (nextMeta.revision ?? 0) + 1,
      });
      const next = await updateBoothComposition(session.id, nextFrame, packed, {
        background: persistBackground,
        frontSlot: nextMeta.frontSlot,
        soloLayout: nextMeta.soloLayout,
      });
      setSession(next);
      sceneSpanAppliedServerRevRef.current = next.compositionRevision ?? nextMeta.revision + 1;
      if (nextMeta.sceneSpanMode === parseBoothSceneSpanMode(next.sameSpaceSceneSpanMode, nextMeta.sceneSpanMode)) {
        sceneSpanLocalDirtyRef.current = false;
      }
      setSameSpaceMeta({
        // Keep the in-memory signed URL for immediate preview; server stores path only.
        background: nextMeta.background,
        frontSlot: next.sameSpaceFrontSlot ?? nextMeta.frontSlot,
        soloLayout: next.sameSpaceSoloLayout ?? nextMeta.soloLayout,
        revision: next.compositionRevision ?? nextMeta.revision + 1,
        sceneSpanMode: nextMeta.sceneSpanMode
          ?? parseBoothSceneSpanMode(next.sameSpaceSceneSpanMode, DEFAULT_BOOTH_SCENE_SPAN_MODE),
        slotManualOffsets: nextMeta.slotManualOffsets ?? next.sameSpaceSlotManualOffsets ?? {},
        slotSubjectPlacements: nextMeta.slotSubjectPlacements ?? next.sameSpaceSlotSubjectPlacements ?? {},
      });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'COMPOSITION_SAVE_FAILED');
    }
  };

  const selectSceneSpanMode = async (mode: BoothSceneSpanMode) => {
    if (!session || !user?.id) return;
    // Live + capture are two_cell fixed — selector only works in Review.
    if (session.status !== 'review') return;
    if (reviewSceneSpanMode === mode) return;
    reviewSpanDirtyRef.current = true;
    sceneSpanLocalDirtyRef.current = true;
    setReviewSceneSpanMode(mode);
    // Immediate local preview only — persist when user finishes (or debounce save).
    // Do NOT remount editors, regenerate cutouts, or autoFit transforms.
    const nextMeta: SameSpaceCompositionMeta = {
      ...sameSpaceMeta,
      sceneSpanMode: mode,
    };
    setSameSpaceMeta(nextMeta);
    void saveComposition(frameId, slotCrops, nextMeta);
  };

  const openCompositionEditor = (
    shotIndex: number,
    source: 'shot-card' | 'final-strip',
    stripSlotIndex?: number,
  ) => {
    if (stripPreviewRef.current) {
      stripScrollTopRef.current = stripPreviewRef.current.scrollTop;
    }
    setCompositionEditTarget(buildCompositionEditorTarget({ shotIndex, source, stripSlotIndex }));
  };

  const closeCompositionEditor = () => {
    setCompositionEditTarget(null);
    requestAnimationFrame(() => {
      if (stripPreviewRef.current) {
        stripPreviewRef.current.scrollTop = stripScrollTopRef.current;
      }
    });
  };

  const participantSlots = session
    ? resolveSessionParticipantSlots({
      localUserId: user?.id ?? '',
      hostUserId: session.hostUserId,
      guestUserId: session.guestUserId,
      leftParticipantId: session.leftParticipantId,
      rightParticipantId: session.rightParticipantId,
    })
    : null;
  const leftUserId = participantSlots?.leftUserId ?? '';
  const rightUserId = participantSlots?.rightUserId ?? '';
  const activePoseId: CouplePoseId = poseEvent?.sessionId === validSessionId ? poseEvent.poseId : 'free';
  const activeSharedSceneId: BoothSharedSceneId = sharedSceneEvent?.sessionId === validSessionId
    ? sharedSceneEvent.sceneId
    : 'classic';
  const lightingEnabled = lightingModeEvent?.sessionId === validSessionId
    ? lightingModeEvent.enabled
    : true;
  const companionsForShot = (index: number) => capturedCompanionsByShot[index] ?? baseBoothCompanions;
  const localPoseRole = couplePoseRoleForParticipant(
    user?.id,
    session ? [session.hostUserId, session.guestUserId] : [],
  );

  const modePlacementsForShot = (
    shotIndex: number,
    spanMode: BoothSceneSpanMode = reviewSceneSpanMode,
  ): Record<string, SubjectPlacement> => {
    const shot = slotSubjectPlacementsFor(sameSpaceMeta, shotIndex);
    const out: Record<string, SubjectPlacement> = {};
    if (leftUserId) out[leftUserId] = placementForSubject(shot, spanMode, leftUserId);
    if (rightUserId) out[rightUserId] = placementForSubject(shot, spanMode, rightUserId);
    return out;
  };

  const saveShotSubjectPlacements = (
    shotIndex: number,
    placements: Record<string, SubjectPlacement>,
    frontSubjectId: string | null,
  ) => {
    const prevShot = slotSubjectPlacementsFor(sameSpaceMeta, shotIndex);
    const modeKey = reviewSceneSpanMode === 'one_cell' ? 'one_cell' : 'two_cell';
    const nextShot = {
      ...prevShot,
      [modeKey]: {
        ...prevShot[modeKey],
        ...placements,
      },
      frontSubjectId,
    };
    const nextLegacy = { ...(sameSpaceMeta.slotManualOffsets ?? {}) };
    delete nextLegacy[String(shotIndex)];
    const nextMeta: SameSpaceCompositionMeta = {
      ...sameSpaceMeta,
      frontSlot: frontSubjectId === rightUserId ? 'right' : 'left',
      slotManualOffsets: nextLegacy,
      slotSubjectPlacements: {
        ...(sameSpaceMeta.slotSubjectPlacements ?? {}),
        [String(shotIndex)]: nextShot,
      },
    };
    setSameSpaceMeta(nextMeta);
    void saveComposition(frameId, slotCrops, nextMeta);
  };

  const setMySide = async (side: 'left' | 'right') => {
    if (!session || !user?.id || positionRpcReady !== true) return;
    const other = user.id === session.hostUserId ? session.guestUserId : session.hostUserId;
    const left = side === 'left' ? user.id : other;
    const right = side === 'left' ? other : user.id;
    const previous = session;
    // Optimistic assignment — manual offsets reset on seat change (server policy).
    setSession({
      ...session,
      leftParticipantId: left,
      rightParticipantId: right,
      participantTransforms: {},
    });
    setLiveTransforms({});
    try {
      await mediaRoom.mediaRef.current?.sendReliableEvent({
        type: 'positions_preview',
        userId: user.id,
        leftParticipantId: left,
        rightParticipantId: right,
        participantTransforms: {},
      });
    } catch {
      /* preview sync is best-effort */
    }
    try {
      const updated = await updateBoothPositions(
        session.id,
        left,
        right,
        session.positionRevision ?? 0,
      );
      setSession(updated);
      setLiveTransforms(updated.participantTransforms ?? {});
    } catch (error) {
      setSession(previous);
      setLiveTransforms(previous.participantTransforms ?? {});
      const classified = classifyBoothPositionError(error);
      if (import.meta.env.DEV) {
        setPositionDevHint(`${classified.code}: ${classified.rawMessage}`);
      }
      if (classified.code === 'RPC_NOT_DEPLOYED' || classified.code === 'RPC_SIGNATURE_MISMATCH') {
        setPositionRpcReady(false);
      }
      if (classified.code === 'REVISION_CONFLICT') {
        void reload();
      }
      setPageError(classified.userMessage);
    }
  };

  const swapSides = async () => {
    if (!session || !user?.id || positionRpcReady !== true) return;
    const previous = session;
    const nextLeft = session.rightParticipantId ?? session.guestUserId;
    const nextRight = session.leftParticipantId ?? session.hostUserId;
    setSession({
      ...session,
      leftParticipantId: nextLeft,
      rightParticipantId: nextRight,
      participantTransforms: {},
    });
    setLiveTransforms({});
    try {
      await mediaRoom.mediaRef.current?.sendReliableEvent({
        type: 'positions_preview',
        userId: user.id,
        leftParticipantId: nextLeft,
        rightParticipantId: nextRight,
        participantTransforms: {},
      });
    } catch {
      /* best-effort */
    }
    try {
      const updated = await swapBoothPositions(session.id, session.positionRevision ?? 0);
      setSession(updated);
      setLiveTransforms(updated.participantTransforms ?? {});
    } catch (error) {
      setSession(previous);
      setLiveTransforms(previous.participantTransforms ?? {});
      const classified = classifyBoothPositionError(error);
      if (import.meta.env.DEV) {
        setPositionDevHint(`${classified.code}: ${classified.rawMessage}`);
      }
      if (classified.code === 'RPC_NOT_DEPLOYED' || classified.code === 'RPC_SIGNATURE_MISMATCH') {
        setPositionRpcReady(false);
      }
      if (classified.code === 'REVISION_CONFLICT') {
        void reload();
      }
      setPageError(classified.userMessage);
    }
  };

  const onLocalTransformPreview = (offset: SameSpaceManualOffset) => {
    if (!user?.id) return;
    setLiveTransforms((prev) => ({ ...prev, [user.id]: offset }));
    void mediaRoom.mediaRef.current?.sendReliableEvent({
      type: 'transform_preview',
      userId: user.id,
      offsetX: offset.offsetX,
      offsetY: offset.offsetY,
      scale: offset.scale,
    }).catch(() => undefined);
  };

  const onLocalTransformCommit = async (offset: SameSpaceManualOffset) => {
    if (!session || !user?.id || positionRpcReady !== true) return;
    const previous = session;
    setLiveTransforms((prev) => ({ ...prev, [user.id]: offset }));
    try {
      const updated = await updateBoothParticipantTransform(
        session.id,
        user.id,
        offset,
        session.positionRevision ?? 0,
      );
      setSession(updated);
      setLiveTransforms(updated.participantTransforms ?? {});
    } catch (error) {
      setSession(previous);
      setLiveTransforms(previous.participantTransforms ?? {});
      const classified = classifyBoothPositionError(error);
      if (import.meta.env.DEV) {
        setPositionDevHint(`${classified.code}: ${classified.rawMessage}`);
      }
      if (classified.code === 'RPC_NOT_DEPLOYED' || classified.code === 'RPC_SIGNATURE_MISMATCH') {
        setPositionRpcReady(false);
      }
      if (classified.code === 'REVISION_CONFLICT') {
        void reload();
      }
      setPageError(classified.userMessage);
    }
  };

  const resetMyPosition = async () => {
    await onLocalTransformCommit(DEFAULT_SAME_SPACE_MANUAL_OFFSET);
  };

  const selectBackgroundKey = async (key: SameSpaceBackgroundKey) => {
    if (!session || !user?.id) return;
    const previousMeta = sameSpaceMeta;
    const previousSession = session;
    const nextBg = sameSpaceBackgroundFromKey(key);
    setSameSpaceMeta((prev) => ({ ...prev, background: nextBg }));
    setSession((prev) => (prev ? { ...prev, sameSpaceBackground: nextBg } : prev));
    try {
      await mediaRoom.mediaRef.current?.sendReliableEvent({
        type: 'background_preview',
        userId: user.id,
        backgroundKey: key,
      });
    } catch {
      /* best-effort */
    }
    try {
      const updated = await updateBoothStyle(session.id, {
        background: nextBg,
        expectedRevision: session.compositionRevision ?? 0,
      });
      setSession(updated);
      setSameSpaceMeta((prev) => ({
        ...prev,
        background: updated.sameSpaceBackground ?? nextBg,
        revision: updated.compositionRevision ?? prev.revision + 1,
      }));
    } catch (error) {
      setSameSpaceMeta(previousMeta);
      setSession(previousSession);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('COMPOSITION_REVISION_CONFLICT')) {
        void reload();
        setPageError('상대가 설정을 바꿨어요. 최신 상태를 불러왔어요.');
        return;
      }
      setPageError('배경을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const selectOurRoom = async (includePets = true) => {
    if (!session || !user?.id || preparingOurRoom || !canChangeBoothRoomSnapshot(session.currentShotIndex)) return;
    const previousMeta = sameSpaceMeta;
    const previousSession = session;
    setPreparingOurRoom(true);
    setPageError(null);
    try {
      const snapshot = await loadBoothRoomSnapshot(session.coupleId, includePets);
      const plates = await renderBoothRoomPlates(snapshot);
      const snapshotKey = `${Date.now()}-${includePets ? 'pets' : 'no-pets'}`;
      const background = await uploadBoothRoomPlates({
        coupleId: session.coupleId,
        sessionId: session.id,
        snapshotKey,
        includePets,
        ...plates,
      });
      const updated = await updateBoothStyle(session.id, {
        background,
        expectedRevision: session.compositionRevision ?? 0,
      });
      setSession({ ...updated, sameSpaceBackground: background });
      setSameSpaceMeta((current) => ({
        ...current,
        background,
        revision: updated.compositionRevision ?? current.revision + 1,
      }));
      if (isOurRoomBackground(previousMeta.background)
        && previousMeta.background.storagePath !== background.storagePath) {
        void removeSupersededBoothRoomPlates({
          background: previousMeta.background,
          coupleId: session.coupleId,
          sessionId: session.id,
        });
      }
    } catch (error) {
      setSession(previousSession);
      setSameSpaceMeta(previousMeta);
      const message = error instanceof Error ? error.message : '';
      setPageError(message === 'OUR_ROOM_MEDIA_FAILED' || message === 'OUR_ROOM_MEDIA_TIMEOUT'
        ? t('우리 방 미디어를 불러오지 못했어요. 다시 시도해 주세요.')
        : t('우리 방을 준비하지 못했어요. 다시 시도해 주세요.'));
    } finally {
      setPreparingOurRoom(false);
    }
  };

  const selectColorMode = async (mode: BoothColorMode) => {
    if (!session || !user?.id) return;
    const previous = colorMode;
    const previousSession = session;
    setColorMode(mode);
    setSession((prev) => (prev ? { ...prev, colorMode: mode } : prev));
    try {
      await mediaRoom.mediaRef.current?.sendReliableEvent({
        type: 'color_mode_preview',
        userId: user.id,
        colorMode: mode,
      });
    } catch {
      /* best-effort */
    }
    try {
      const updated = await updateBoothStyle(session.id, {
        colorMode: mode,
        expectedRevision: session.compositionRevision ?? 0,
      });
      setSession(updated);
      setColorMode(parseBoothColorMode(updated.colorMode));
    } catch (error) {
      setColorMode(previous);
      setSession(previousSession);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('COMPOSITION_REVISION_CONFLICT')) {
        void reload();
        setPageError('상대가 설정을 바꿨어요. 최신 상태를 불러왔어요.');
        return;
      }
      setPageError('필터를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const onApprove = async () => {
    const role = isHost ? 'host' : 'guest';
    await updateBoothApproval(session.id, role, true);
  };

  const shareFinal = async () => {
    if (!finalUrl) return;
    try {
      const response = await fetch(finalUrl);
      if (!response.ok) throw new Error('FINAL_IMAGE_UNAVAILABLE');
      const file = new File([await response.blob()], 'jongjong-booth.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'JONGJONG Couple Booth', files: [file] });
        return;
      }
      await navigator.clipboard.writeText(finalUrl);
      setCaptureHint('Share link copied.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setPageError(error instanceof Error ? error.message : 'SHARE_FAILED');
    }
  };

  const bringBoothSourceToRoom = async (shotId: string | null) => {
    const key = shotId ?? 'final';
    setHandoffBusyKey(key);
    setHandoffError(null);
    try {
      await requestBoothRoomImport(session.id, shotId);
      setHandoffReadyKey(key);
    } catch {
      // The completed Booth result remains untouched; only the handoff is retryable.
      setHandoffError(t('방으로 보내지 못했어요. 다시 시도해 주세요.'));
    } finally {
      setHandoffBusyKey(null);
    }
  };

  const finalize = async (solo: boolean) => {
    if (!session || finalizingLock.current) return;
    if (!isExactSelection(selected)) {
      setPageError(boothFinalizeUserMessage('INVALID_SELECTION_COUNT'));
      return;
    }
    // Authoritative couple id comes from the booth session row, not the profile cache.
    const coupleId = session.coupleId;
    if (!coupleId) {
      setPageError(boothFinalizeUserMessage('INVALID_SESSION_STATE'));
      return;
    }
    finalizingLock.current = true;
    setFinalizing(true);
    setFinalizeState('validating');
    setPageError(null);
    setFinalizeDevMeta(null);
    if (!finalizeRequestIdRef.current) {
      finalizeRequestIdRef.current = crypto.randomUUID();
    }
    const finalizeRequestId = finalizeRequestIdRef.current;
    try {
      if (session.finalImagePath) {
        const url = await signedBoothUrl(session.finalImagePath);
        setFinalUrl(url ?? null);
        setFinalizeState('completed');
        return;
      }
      if (!user) throw new BoothFinalizeError(401, 'UNAUTHORIZED');

      const claim = await beginBoothFinalization({
        sessionId: session.id,
        selectedShotIndexes: selected,
        allowHostSolo: solo,
        actorId: user.id,
      });
      if (claim.kind === 'recover_completed') {
        setSession(claim.session);
        if (claim.session.finalImagePath) {
          setFinalUrl((await signedBoothUrl(claim.session.finalImagePath)) ?? null);
        }
        setFinalizeState('completed');
        finalizeRequestIdRef.current = null;
        return;
      }
      if (claim.kind === 'claimed_by_other') {
        setFinalizeState('submitting');
        const completed = await waitForBoothCompletion(session.id);
        setSession(completed);
        if (completed.finalImagePath) {
          setFinalUrl((await signedBoothUrl(completed.finalImagePath)) ?? null);
        }
        setFinalizeState('completed');
        finalizeRequestIdRef.current = null;
        return;
      }

      setFinalizeState('submitting');
      const stripCells: FinalStripCell[] = [];
      for (const [slot, index] of selected.entries()) {
        const host = findParticipantShot(shots, index, session.hostUserId);
        const guest = findParticipantShot(shots, index, session.guestUserId);
        const leftShot = findParticipantShot(shots, index, leftUserId);
        const rightShot = findParticipantShot(shots, index, rightUserId);
        const leftCutoutUri = leftShot ? urls[cutoutUrlKey(leftShot.id)] : undefined;
        const rightCutoutUri = rightShot ? urls[cutoutUrlKey(rightShot.id)] : undefined;
        const roomFallback = isOurRoomBackground(sameSpaceMeta.background);
        const leftCompositionUri = leftCutoutUri ?? (roomFallback && leftShot ? urls[leftShot.id] : undefined);
        const rightCompositionUri = rightCutoutUri ?? (roomFallback && rightShot ? urls[rightShot.id] : undefined);
        const assets = resolveSameSpaceShotAssets(shots, index, session.hostUserId, session.guestUserId);
        const useSameSpacePair = canShowSameSpaceComposition({
          sameSpaceEnabled,
          hostCutoutUrl: leftCutoutUri,
          guestCutoutUrl: rightCutoutUri,
          assets,
        });
        const useSameSpaceSolo = canShowSameSpaceLayers({
          sameSpaceEnabled,
          leftCutoutUrl: leftCutoutUri,
          rightCutoutUrl: rightCutoutUri,
        });
        const useSameSpace = useSameSpacePair || useSameSpaceSolo || Boolean(roomFallback && (leftCompositionUri || rightCompositionUri));
        stripCells.push({
          hostUri: host
            ? await signedBoothUrl(host.imagePath, {
                soft: true,
                sessionKey: session.id.slice(0, 8),
                shotId: host.id,
                shotIndex: index,
                role: 'host',
                assetStatus: 'original',
              })
            : undefined,
          guestUri: guest
            ? await signedBoothUrl(guest.imagePath, {
                soft: true,
                sessionKey: session.id.slice(0, 8),
                shotId: guest.id,
                shotIndex: index,
                role: 'guest',
                assetStatus: 'original',
              })
            : undefined,
          transform: slotCrops[slot] ?? DEFAULT_BOOTH_CROP,
          hostMirror: host ? { mirrorX: host.mirrorX ?? true, mirrorBakedIntoAsset: host.mirrorBakedIntoAsset ?? true } : undefined,
          guestMirror: guest ? { mirrorX: guest.mirrorX ?? true, mirrorBakedIntoAsset: guest.mirrorBakedIntoAsset ?? true } : undefined,
          leftCutoutUri: useSameSpace ? leftCompositionUri : undefined,
          rightCutoutUri: useSameSpace ? rightCompositionUri : undefined,
          leftMirror: useSameSpace && leftShot
            ? (leftCutoutUri ? sameSpaceCutoutMirrorMeta(leftShot.mirrorX) : { mirrorX: leftShot.mirrorX, mirrorBakedIntoAsset: leftShot.mirrorBakedIntoAsset })
            : undefined,
          rightMirror: useSameSpace && rightShot
            ? (rightCutoutUri ? sameSpaceCutoutMirrorMeta(rightShot.mirrorX) : { mirrorX: rightShot.mirrorX, mirrorBakedIntoAsset: rightShot.mirrorBakedIntoAsset })
            : undefined,
          background: sameSpaceMeta.background,
          sharedSceneId: activeSharedSceneId,
          lightingEnabled,
          companions: companionsForShot(index),
          frontSlot: slotFrontSlotFor(sameSpaceMeta, index),
          soloLayout: sameSpaceMeta.soloLayout,
          leftSubjectId: leftUserId,
          rightSubjectId: rightUserId,
          placementsBySubjectId: modePlacementsForShot(index),
          frontSubjectId: slotFrontSubjectIdFor(
            sameSpaceMeta,
            index,
            leftUserId,
            rightUserId,
          ),
          leftManualOffset: slotManualOffsetsFor(sameSpaceMeta, index).left,
          rightManualOffset: slotManualOffsetsFor(sameSpaceMeta, index).right,
          useStoredManualOffsets: true,
        });
      }
      if (stripCells.some((cell) => !cell.hostUri && !cell.guestUri && !cell.leftCutoutUri && !cell.rightCutoutUri)) {
        throw new BoothFinalizeError(400, 'SHOT_NOT_READY');
      }
      // Dual-participant classic mode still requires both originals.
      if (!sameSpaceEnabled && stripCells.some((cell) => !cell.hostUri || !cell.guestUri)) {
        throw new BoothFinalizeError(400, 'SHOT_NOT_READY');
      }
      const uri = await composeFinalBoothStrip(
        stripCells,
        undefined,
        frameId,
        [],
        parseBoothColorMode(session.colorMode ?? colorMode),
        reviewSceneSpanMode,
        captureViewportMode,
      );
      const memoryId = await createBoothMemory({
        userId: user.id,
        coupleId,
        sessionId: session.id,
        selectedShotIndexes: selected,
        participantIds: [session.hostUserId, session.guestUserId],
        finalBlobUri: uri,
        solo,
      });
      const completed = await completeBoothSession({
        sessionId: session.id,
        coupleId,
        finalUri: uri,
        memoryId,
        selectedShotIndexes: selected,
        allowHostSolo: solo,
        finalizeRequestId,
      });
      URL.revokeObjectURL(uri);
      setSession(completed);
      if (completed.finalImagePath) {
        setFinalUrl((await signedBoothUrl(completed.finalImagePath)) ?? null);
      }
      setFinalizeState('completed');
      finalizeRequestIdRef.current = null;
    } catch (err) {
      setFinalizeState('failed');
      if (err instanceof BoothFinalizeError) {
        if (err.code === 'ALREADY_FINALIZED') {
          setFinalizeState('completed');
          await reload();
          return;
        }
        if (err.code === 'REVISION_CONFLICT' || err.code === 'SELECTION_CHANGED') {
          setPageError(boothFinalizeUserMessage(err.code));
          await reload();
          return;
        }
        setPageError(boothFinalizeUserMessage(err.code));
        setFinalizeDevMeta({
          requestId: err.requestId,
          code: err.code,
          stage: err.stage,
        });
        if (import.meta.env.DEV) {
          console.error(
            '[couple-booth][finalize]',
            `requestId=${err.requestId ?? '-'}`,
            `status=${err.status}`,
            `code=${err.code}`,
            `stage=${err.stage ?? '-'}`,
            `message=${err.messageText ?? '-'}`,
            `retryable=${err.retryable ?? '-'}`,
          );
        }
        return;
      }
      setPageError(err instanceof Error ? err.message : boothFinalizeUserMessage('INTERNAL_FINALIZE_ERROR'));
      setFinalizeDevMeta(null);    } finally {
      setFinalizing(false);
      finalizingLock.current = false;
    }
  };

  const phase = captureTimerPhase(remainingSec, clockActive);
  const displaySec =
    clockActive && remainingSec != null ? remainingSec : COUPLE_BOOTH_CAPTURE_DURATION_SECONDS;
  const timerLabel = `${formatCaptureCountdown(displaySec)} / ${formatCaptureCountdown(COUPLE_BOOTH_CAPTURE_DURATION_SECONDS)}`;
  const isRecoveringExpiredSession = recoveryState === 'recovering-expired-session';
  const canPressStart = canScheduleManualShot({
    isHost,
    partnerConnected: mediaRoom.remoteConnected,
    bothReady,
    clockActive,
    startInFlight: busy || captureStartLock.current,
    captureBusy: Boolean(capture.busyCaptureId),
    pendingCaptureAt: session?.currentCaptureAt,
    canScheduleNext: !isRecoveringExpiredSession && canScheduleNextCapture(session?.mediaExpiresAt),
  });
  const canStartCaptureClock = planCaptureAutoStart({
    isHost,
    partnerConnected: mediaRoom.remoteConnected,
    localReady,
    remoteReady,
    captureStarted: clockActive,
    startInFlight: busy || captureStartLock.current,
  }).startClock;
  const mediaConnectionActive = mediaRoom.mediaState === 'connecting-room'
    || mediaRoom.mediaState === 'publishing-media'
    || mediaRoom.mediaState === 'connected';
  const showLiveStage = Boolean(
    session && canShowBoothCameraStage({
      status: session.status,
      mediaConnectionActive,
      localMediaReady: mediaRoom.localMediaReady,
      remoteMediaReady: remoteReady,
    }),
  );
  const showPreparationView = Boolean(
    session
    && (
      session.status === 'invited'
      || isMediaActiveStatus(session.status)
    )
    && !showLiveStage,
  );
  const capturePhase = session.status === 'review'
    || session.status === 'finalizing'
    || session.status === 'completed'
    ? 'REVIEW'
    : clockActive
      ? 'CAPTURING'
      : !mediaRoom.remoteConnected
        ? 'WAITING_PARTNER'
        : !localReady || !remoteReady
          ? 'READY_CHECK'
          : !mediaRoom.localMediaReady || !showLiveStage
            ? 'MEDIA_PREPARING'
            : 'PREVIEW';
  const connectionUx = session
    ? resolveBoothStageConnectionUx({
      sessionStatus: session.status,
      mediaState: mediaRoom.mediaState,
      livekitConnection: mediaRoom.connectionState,
      remoteConnected: mediaRoom.remoteConnected,
      localPreviewReady: mediaRoom.localMediaReady,
    })
    : 'preparing';
  const connectionCopy = (() => {
    if (clockActive) return { title: t('함께 촬영 중'), detail: null as string | null };
    if (session.status === 'invited') {
      return { title: t('상대를 기다리고 있어요'), detail: t('초대를 보냈어요. 상대가 들어오면 함께 촬영을 준비할 수 있어요.') };
    }
    if (mediaRoom.remoteConnected && localReady && remoteReady && !clockActive) {
      return { title: t('함께 촬영 준비 완료'), detail: t('화면을 맞춘 뒤 촬영을 눌러 주세요.') };
    }
    if (mediaRoom.remoteConnected && !mediaRoom.localMediaReady) {
      return { title: t('함께 연결됐어요'), detail: t('둘 다 준비되면 촬영을 시작해요.') };
    }
    if (session.status === 'review' || session.status === 'finalizing') {
      return { title: t('사진을 고르는 중'), detail: null };
    }
    if (session.status === 'completed') {
      return { title: t('사진이 완성됐어요'), detail: null };
    }
    if (['declined', 'cancelled', 'expired', 'failed'].includes(session.status)) {
      return { title: t('촬영이 종료됐어요'), detail: null };
    }
    return boothStageConnectionCopy(connectionUx);
  })();
  const showPermissionError = isBoothMediaErrorState(mediaRoom.mediaState);
  const permissionErrorCode = mediaRoom.errorCode;
  const joinFailure = showPermissionError || pageError
    ? classifyBoothJoinFailure({
      mediaState: mediaRoom.mediaState,
      mediaErrorCode: permissionErrorCode,
      pageError,
      tokenError: mediaRoom.tokenError,
    })
    : null;
  const isLiveMediaPhase = capturePhase === 'CAPTURING';
  // Same Space is persisted through the existing RPC before capture. During
  // the authoritative capture window, the host preview is shared over the
  // existing reliable media channel; only an in-flight shot temporarily locks it.
  const sameSpaceModeLocked = Boolean(
    capture.busyCaptureId
      || (session.currentCaptureAt && Date.parse(session.currentCaptureAt) > Date.now()),
  );

  const setLiveSameSpaceMode = async (enabled: boolean) => {
    if (!session || !isHost || sameSpaceModeLocked) return;
    if (!clockActive) {
      try {
        const updated = await setSameSpaceMode(session.id, enabled);
        setSameSpaceEnabledOverride(null);
        try {
          if (validSessionId) sessionStorage.removeItem(`booth_same_space:${validSessionId}`);
        } catch {
          // Private browsing storage is optional.
        }
        setSession(updated);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : 'SAME_SPACE_MODE_FAILED');
      }
      return;
    }
    setSameSpaceEnabledOverride(enabled);
    try {
      await mediaRoom.mediaRef.current?.sendReliableEvent({
        type: 'same_space_mode_preview',
        userId: user.id,
        sameSpaceEnabled: enabled,
      });
    } catch {
      // Local state remains usable if the peer is temporarily unavailable.
    }
  };

  const toggleMicrophone = async () => {
    const next = !micEnabled;
    try {
      if (room) {
        await room.localParticipant.setMicrophoneEnabled(next);
      }
      setMicEnabled(next);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'MIC_TOGGLE_FAILED');
    }
  };

  const selectCouplePose = (poseId: CouplePoseId) => {
    if (!validSessionId || !user?.id) return;
    const current = poseEventRef.current;
    const selectedAt = Date.now();
    const next = createBoothPoseEvent({
      sessionId: validSessionId,
      poseId,
      selectedBy: user.id,
      selectedAt,
      version: current?.sessionId === validSessionId ? current.version + 1 : 1,
      eventId: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${user.id}:${selectedAt}:${Math.random().toString(36).slice(2)}`,
    });
    poseEventRef.current = next;
    setPoseEvent(next);
    void mediaRoom.mediaRef.current?.sendReliableEvent(next).catch(() => undefined);
  };

  const selectSharedScene = (sceneId: BoothSharedSceneId) => {
    if (!validSessionId || !user?.id) return;
    const current = sharedSceneEventRef.current;
    const selectedAt = Date.now();
    const next = createBoothSharedSceneEvent({
      sessionId: validSessionId,
      sceneId,
      selectedBy: user.id,
      selectedAt,
      version: current?.sessionId === validSessionId ? current.version + 1 : 1,
      eventId: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${user.id}:scene:${selectedAt}:${Math.random().toString(36).slice(2)}`,
    });
    sharedSceneEventRef.current = next;
    setSharedSceneEvent(next);
    void mediaRoom.mediaRef.current?.sendReliableEvent(next).catch(() => undefined);
  };

  const selectLightingMode = (enabled: boolean) => {
    if (!validSessionId || !user?.id) return;
    const current = lightingModeEventRef.current;
    const selectedAt = Date.now();
    const next = createBoothLightingModeEvent({
      sessionId: validSessionId,
      enabled,
      selectedBy: user.id,
      selectedAt,
      version: current?.sessionId === validSessionId ? current.version + 1 : 1,
      eventId: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${user.id}:lighting:${selectedAt}:${Math.random().toString(36).slice(2)}`,
    });
    lightingModeEventRef.current = next;
    setLightingModeEvent(next);
    void mediaRoom.mediaRef.current?.sendReliableEvent(next).catch(() => undefined);
  };

  const updateCompanions = (companions: BoothCompanionPlacement[]) => {
    if (!validSessionId || !user?.id) return;
    const current = companionEventRef.current;
    const selectedAt = Date.now();
    const next = createBoothCompanionStateEvent({
      sessionId: validSessionId,
      companions,
      selectedBy: user.id,
      selectedAt,
      version: current?.sessionId === validSessionId ? current.version + 1 : 1,
      eventId: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${user.id}:companion:${selectedAt}:${Math.random().toString(36).slice(2)}`,
    });
    companionEventRef.current = next;
    setCompanionEvent(next);
    void mediaRoom.mediaRef.current?.sendReliableEvent(next).catch(() => undefined);
  };

  return (
    <div className={`booth-stage-shell${showLiveStage ? ' is-live' : ''}`} data-capture-phase={capturePhase}>
      <header className="booth-stage-top">
        <p className="booth-stage-brand">jongjong</p>
        <div className="booth-stage-status" aria-live="polite">
          <strong>{connectionCopy.title}</strong>
          {connectionCopy.detail ? <span>{connectionCopy.detail}</span> : null}
          {clockActive ? <span className={`booth-stage-timer phase-${phase}`}>{timerLabel}</span> : null}
        </div>
        <div className="booth-stage-header-actions">
          <button type="button" className="booth-stage-home-button" onClick={onHome}>
            {t('홈')}
          </button>
          <BoothStageMenu
            showSignOut={!isGuestLinkMode}
            onSignOut={() => {
              void mediaRoom.disconnect().finally(() => {
                void signOut();
              });
            }}
          />
        </div>
      </header>

      {showLiveStage && isHost ? (
        <div className="booth-capture-viewport-control" role="group" aria-label="촬영 화면">
          <span>{t('촬영 화면')}</span>
          <button
            type="button"
            className={`booth-capture-viewport-btn${captureViewportMode === 'desktop' ? ' is-active' : ''}`}
            disabled={captureViewportModeLocked}
            onClick={() => broadcastCaptureViewportMode('desktop')}
          >
            {t('양쪽 커플샷')}
          </button>
          <button
            type="button"
            className={`booth-capture-viewport-btn${captureViewportMode === 'mobile' ? ' is-active' : ''}`}
            disabled={captureViewportModeLocked}
            onClick={() => broadcastCaptureViewportMode('mobile')}
          >
            {t('세로 아이폰')}
          </button>
        </div>
      ) : showLiveStage ? (
        <div className="booth-capture-viewport-control is-readonly" role="group" aria-label="촬영 화면">
          <span>{t('촬영 화면')}</span>
          <strong>{captureViewportMode === 'mobile' ? t('세로 아이폰') : t('양쪽 커플샷')}</strong>
        </div>
      ) : null}

      {isHost && profile?.isInternalTester && validSessionId ? (
        <div className="booth-stage-tester">
          <BoothGuestLinkPanel sessionId={validSessionId} enabled />
        </div>
      ) : null}

      {finalizeState === 'failed' && pageError ? (
        <div className="booth-stage-banner" role="alert">
          <p className="error-text">{pageError}</p>
          {import.meta.env.DEV && finalizeDevMeta ? (
            <p className="booth-entry-detail" style={{ opacity: 0.75, fontSize: 12 }}>
              DEV finalize: requestId={finalizeDevMeta.requestId ?? '-'} · code={finalizeDevMeta.code ?? '-'} · stage={finalizeDevMeta.stage ?? '-'}
            </p>
          ) : null}
        </div>
      ) : null}

      {shouldShowReviewFatalBanner({
        pageError: finalizeState === 'failed' ? null : pageError,
        status: session.status,
        readyCandidateCount: candidates.length,
        captureInFlight: Boolean(capture.busyCaptureId),
      }) && !showPermissionError ? (
        <div className="booth-stage-banner" role="alert">
          <p className="error-text">{
            isCaptureSyncErrorCode(pageError)
              ? reviewCaptureShortageCopy().title
              : classifyBoothJoinFailure({ pageError }).title
          }
          </p>
          <p className="booth-entry-detail">
            {isCaptureSyncErrorCode(pageError)
              ? reviewCaptureShortageCopy().detail
              : classifyBoothJoinFailure({ pageError }).detail}
          </p>
        </div>
      ) : null}

      {!shouldShowReviewFatalBanner({
        pageError,
        status: session.status,
        readyCandidateCount: candidates.length,
        captureInFlight: Boolean(capture.busyCaptureId),
      })
        && session.status === 'review'
        && candidates.length < REQUIRED_SELECTED_SHOTS
        && isCaptureSyncErrorCode(pageError) ? (
        <div className="booth-stage-banner" role="status">
          <p className="error-text">{reviewCaptureShortageCopy().title}</p>
          <p className="booth-entry-detail">{reviewCaptureShortageCopy().detail}</p>
        </div>
      ) : null}

      {captureSyncNotice && session.status !== 'review' && session.status !== 'finalizing' && session.status !== 'completed' ? (
        <div className="booth-stage-banner" role="status">
          <p className="error-text">{captureSyncNotice.title}</p>
          <p className="booth-entry-detail">{captureSyncNotice.detail}</p>
        </div>
      ) : null}

      {assetLoadError ? (
        <div className="booth-stage-banner" role="alert">
          <p className="error-text">{assetLoadError}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setAssetLoadError(null);
              void reload().catch((err) => {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                setAssetLoadError(err instanceof Error ? err.message : 'Photo reload failed');
              });
            }}
          >
            사진 다시 불러오기
          </button>
        </div>
      ) : null}

      {isRecoveringExpiredSession ? (
        <div className="booth-stage-banner" aria-live="polite">
          <p>이 촬영 공간이 만료되어 새 공간을 준비하고 있어요.</p>
        </div>
      ) : recoveryState === 'recovery-failed' ? (
        <div className="booth-stage-banner" role="alert">
          <p className="error-text">새 촬영 공간을 준비하지 못했습니다.</p>
          <button type="button" className="btn btn-primary" onClick={() => void discardAndCreateFreshSession()}>
            새로 시작
          </button>
        </div>
      ) : null}

      {showPermissionError ? (
        <div className="booth-stage-banner" role="alert">
          <p className="error-text" style={{ fontWeight: 700 }}>
            {joinFailure?.title ?? '연결에 문제가 있어요'}
          </p>
          <p className="booth-entry-detail" style={{ whiteSpace: 'pre-line' }}>
            {joinFailure?.detail
              ?? (permissionErrorCode ? mediaErrorCopy(permissionErrorCode) : mediaRoom.error)}
          </p>
          {import.meta.env.DEV && mediaRoom.tokenError ? (
            <p className="booth-entry-detail" style={{ opacity: 0.7, fontSize: 12 }}>
              DEV token: {mediaRoom.tokenError.code} ({mediaRoom.tokenError.status || '—'})
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (mediaRoom.connectionState === 'connected' && mediaRoom.remoteConnected) {
                void onReady();
                return;
              }
              void mediaRoom.retryMediaConnection();
            }}
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {showPreparationView ? (
        <main className="booth-ready-view" aria-live="polite">
          {session.status === 'invited' || !mediaRoom.remoteConnected ? (
            <section className="booth-ready-card booth-ready-waiting">
              <span className="booth-ready-icon" aria-hidden="true">♡</span>
              <h1>{t('상대를 기다리고 있어요')}</h1>
              <p>{t('초대를 보냈어요. 상대가 들어오면 함께 촬영을 준비할 수 있어요.').replace('. ', '.\n')}</p>
            </section>
          ) : (
            <section className="booth-ready-card">
              <span className="booth-ready-icon" aria-hidden="true">♡</span>
              <h1>{t('함께 들어왔어요')}</h1>
              <p>{t('둘 다 준비되면 카메라가 열려요.')}</p>
                <div className="booth-ready-statuses" aria-label={t('촬영 준비 상태')}>
                <div className={`booth-ready-status${localReady ? ' is-ready' : ''}`}>
                  <span className="booth-ready-dot" aria-hidden="true">{localReady ? '✓' : '○'}</span>
                  <span>{t('나')}</span>
                  <strong>{localReady ? t('준비됐어요') : t('준비 전')}</strong>
                </div>
                <div className={`booth-ready-status${remoteReady ? ' is-ready' : ''}`}>
                  <span className="booth-ready-dot" aria-hidden="true">{remoteReady ? '✓' : '○'}</span>
                  <span>{t('상대')}</span>
                  <strong>{remoteReady ? t('준비됐어요') : t('준비 전')}</strong>
                </div>
              </div>
              {prepareRequested || readyBusy ? (
                <p className="booth-ready-progress">카메라를 준비하고 있어요…</p>
              ) : localReady ? (
                <p className="booth-ready-progress">상대가 준비하기를 기다리고 있어요.</p>
              ) : remoteReady ? (
                <p className="booth-ready-progress">상대가 준비됐어요 ♡</p>
              ) : null}
              {!localReady ? (
                <button
                  type="button"
                  className="btn btn-primary booth-ready-cta"
                  disabled={prepareRequested || readyBusy || mediaRoom.mediaState !== 'connected'}
                  onClick={() => void onReady()}
                >
                  {prepareRequested || readyBusy ? '카메라를 준비하는 중…' : resolveBoothReadyCta(false, remoteReady)}
                </button>
              ) : null}
            </section>
          )}
        </main>
      ) : null}

      {showLiveStage ? (
        <main className="booth-stage-main">
          <div className="booth-stage-canvas">
            {sameSpaceEnabled ? (
              <SameSpaceVideoStage
                room={room}
                media={mediaRoom.mediaRef.current}
                remoteConnected={mediaRoom.remoteConnected}
                trackEpoch={mediaRoom.trackEpoch}
                hostUserId={session.hostUserId}
                guestUserId={session.guestUserId}
                localUserId={user.id}
                localVisual={mediaRoom.cameraVisual}
                captureViewportMode={captureViewportMode}
                background={sameSpaceMeta.background}
                frontSlot={sameSpaceMeta.frontSlot}
                soloLayout={sameSpaceMeta.soloLayout}
                sceneSpanMode={LIVE_CAPTURE_SCENE_SPAN_MODE}
                leftParticipantId={session.leftParticipantId}
                rightParticipantId={session.rightParticipantId}
                participantTransforms={liveTransforms}
                sharedSceneId={activeSharedSceneId}
                lightingEnabled={lightingEnabled}
                companions={boothCompanions}
                captureHandleRef={sameSpaceCaptureRef}
                onLocalTransformPreview={positionRpcReady === true ? onLocalTransformPreview : undefined}
                onLocalTransformCommit={positionRpcReady === true ? onLocalTransformCommit : undefined}
                poseGuide={{
                  poseId: activePoseId,
                  localRole: localPoseRole,
                  localStageSide: participantSlots?.localSlot ?? null,
                  mode: capture.flash ? 'hidden' : capture.countdown != null ? 'countdown' : 'full',
                }}
              />
            ) : (
              <BoothVideoStage
                room={room}
                media={mediaRoom.mediaRef.current}
                remoteConnected={mediaRoom.remoteConnected}
                trackEpoch={mediaRoom.trackEpoch}
                hostUserId={session.hostUserId}
                guestUserId={session.guestUserId}
                localUserId={user.id}
                localVisual={mediaRoom.cameraVisual}
                captureViewportMode={captureViewportMode}
              />
            )}
            {sameSpaceEnabled ? <BoothCompanionOverlay
              companions={boothCompanions}
              placements={companionPlacements}
              disabled={Boolean(capture.busyCaptureId || capture.countdown != null)}
              onChange={updateCompanions}
              onTap={triggerCompanionTapReaction}
            /> : null}
            <BoothCountdown value={capture.countdown} flash={capture.flash} />
          </div>

          {captureHint ? <p className="booth-stage-hint">{captureHint}</p> : null}
          {isLiveMediaPhase ? (
            <p className="booth-stage-pose">{posePrompt(Math.max(1, capture.currentShot || 1))}</p>
          ) : null}
          {sameSpaceEnabled ? (
            <BoothSharedScenePicker
              activeSceneId={activeSharedSceneId}
              disabled={Boolean(capture.busyCaptureId || (session.currentCaptureAt && Date.parse(session.currentCaptureAt) > Date.now()))}
              onSelect={selectSharedScene}
            />
          ) : null}
          {sameSpaceEnabled ? (
            <div className="booth-lighting-control" role="group" aria-label="Participant lighting">
              <span>Match lighting</span>
              <button
                type="button"
                className={`booth-lighting-toggle${lightingEnabled ? ' is-active' : ''}`}
                aria-pressed={lightingEnabled}
                disabled={Boolean(capture.busyCaptureId || (session.currentCaptureAt && Date.parse(session.currentCaptureAt) > Date.now()))}
                onClick={() => selectLightingMode(!lightingEnabled)}
              >
                {lightingEnabled ? 'On ✓' : 'Off'}
              </button>
            </div>
          ) : null}
          {sameSpaceEnabled ? (
            <CouplePosePicker
              activePoseId={activePoseId}
              disabled={Boolean(capture.busyCaptureId || (session.currentCaptureAt && Date.parse(session.currentCaptureAt) > Date.now()))}
              onSelect={selectCouplePose}
            />
          ) : null}
          {sameSpaceEnabled ? <PetDecoratePanel
            pets={pets}
            placements={companionPlacements}
            disabled={Boolean(capture.busyCaptureId || (session.currentCaptureAt && Date.parse(session.currentCaptureAt) > Date.now()))}
            onChange={updateCompanions}
          /> : null}
          {sameSpaceEnabled && showLiveStage ? (
            <div className="booth-stage-position-controls row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <span className="muted" style={{ marginRight: 4 }}>{t('내 자리')}</span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={positionRpcReady !== true || participantSlots?.localSlot === 'left'}
                onClick={() => void setMySide('left')}
              >
                {t('내가 왼쪽')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={positionRpcReady !== true || participantSlots?.localSlot === 'right'}
                onClick={() => void setMySide('right')}
              >
                {t('내가 오른쪽')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={positionRpcReady !== true}
                onClick={() => void swapSides()}
              >
                {t('자리 바꾸기')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={positionRpcReady !== true}
                onClick={() => void resetMyPosition()}
              >
                {t('위치 초기화')}
              </button>
              <button
                type="button"
                className={`btn btn-secondary${backgroundPickerOpen ? ' is-on' : ''}`}
                onClick={() => setBackgroundPickerOpen((open) => !open)}
              >
                {t('배경')}
              </button>
              {positionRpcReady === false ? (
                <span className="muted">자리 저장 기능을 준비 중이에요.</span>
              ) : null}
              {import.meta.env.DEV && positionDevHint ? (
                <span className="muted" style={{ fontSize: 12 }}>{positionDevHint}</span>
              ) : null}
            </div>
          ) : null}
          {sameSpaceEnabled && showLiveStage ? (
            <SameSpaceBackgroundPicker
              open={backgroundPickerOpen}
              selectedKey={isOurRoomBackground(sameSpaceMeta.background) ? undefined : backgroundKeyFromSameSpaceBackground(sameSpaceMeta.background)}
              ourRoomSelected={isOurRoomBackground(sameSpaceMeta.background)}
              ourRoomPreviewUrl={isOurRoomBackground(sameSpaceMeta.background) ? sameSpaceMeta.background.url : undefined}
              includePets={ourRoomIncludesPets(sameSpaceMeta.background)}
              preparingOurRoom={preparingOurRoom}
              ourRoomDisabled={!canChangeBoothRoomSnapshot(session.currentShotIndex)}
              onSelectOurRoom={() => { void selectOurRoom(true); }}
              onIncludePetsChange={(include) => { void selectOurRoom(include); }}
              onClose={() => setBackgroundPickerOpen(false)}
              onSelect={(key) => {
                void selectBackgroundKey(key);
              }}
            />
          ) : null}

          {clockActive ? (
            <div className="booth-stage-capture-row">
              {isHost ? (
                <button
                  type="button"
                  className="btn btn-primary booth-stage-capture"
                  disabled={!canPressStart}
                  onClick={() => void onScheduleShot()}
                >
                  촬영
                </button>
              ) : (
                <span className="booth-stage-chip is-static">호스트가 촬영을 진행해요</span>
              )}
            </div>
          ) : capturePhase === 'PREVIEW' ? (
            <div className="booth-stage-capture-row booth-stage-preview-actions">
              {isHost ? (
                <button
                  type="button"
                  className="btn btn-primary booth-stage-capture"
                  disabled={!canStartCaptureClock}
                  onClick={() => void onStartCaptureClock()}
                >
                  촬영 시작
                </button>
              ) : (
                <span className="booth-stage-chip is-static">호스트가 촬영 시작을 준비하고 있어요</span>
              )}
            </div>
          ) : null}

          <footer className="booth-stage-controls">
            {mediaRoom.cameras.length > 1 ? (
              <label className="booth-stage-control">
                  <span>{t('카메라')}</span>
                <select
                  onChange={(e) => void mediaRoom.selectCamera?.(e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>
                    {t('선택')}
                  </option>
                  {mediaRoom.cameras.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <button
              type="button"
              className={`booth-stage-chip${micEnabled ? ' is-on' : ''}`}
              disabled={!showLiveStage}
              onClick={() => void toggleMicrophone()}
            >
              {micEnabled ? t('마이크 켜짐') : t('마이크 꺼짐')}
            </button>

            <label className="booth-stage-chip">
              <input
                type="checkbox"
                checked={mediaRoom.cameraVisual.mirrorX}
                disabled={!showLiveStage || Boolean(capture.busyCaptureId) || Boolean(session.currentCaptureAt && Date.parse(session.currentCaptureAt) > Date.now())}
                onChange={(event) => void mediaRoom.setMirrorX(event.target.checked).catch((error) => setPageError(error instanceof Error ? error.message : 'MIRROR_UPDATE_FAILED'))}
              />
              {t('거울')}
            </label>

            {import.meta.env.VITE_SAME_SPACE_MODE_ENABLED === 'true' && isHost && showLiveStage ? (
              <label className="booth-stage-chip booth-stage-same-space-control">
                <input
                  type="checkbox"
                  checked={sameSpaceEnabled}
                  disabled={sameSpaceModeLocked}
                  onChange={(event) => void setLiveSameSpaceMode(event.target.checked)}
                />
                {t('배경·Same Space')}
              </label>
            ) : null}
          </footer>

          {isLiveMediaPhase ? (
            <p className="booth-stage-meta muted">
              {Math.max(shotIndex, capture.currentShot)} / {TOTAL_SHOTS}
            </p>
          ) : null}
        </main>
      ) : null}

      {session.status === 'review' || session.status === 'finalizing' || session.status === 'completed' ? (
        <div className="card booth-review-card" style={{ marginTop: 20 }}>
          <div className="booth-review-header row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0 }}>{t('리뷰')} · {TOTAL_SHOTS}{t('장 중')} {REQUIRED_SELECTED_SHOTS}{t('장 선택')}</h2>
              <p className="muted" style={{ marginBottom: 0 }}>
                {t('두 사람이 함께 사진을 고르고, 둘 다 승인하면 최종본이 만들어져요.')}
              </p>
            </div>
            <div className="booth-review-header-controls" style={{ display: 'grid', gap: 10 }}>
              {sameSpaceEnabled ? (
                <BoothSceneSpanModePicker
                  value={reviewSceneSpanMode}
                  disabled={session.status !== 'review'}
                  onChange={(mode) => void selectSceneSpanMode(mode)}
                />
              ) : null}
              <div className="booth-color-mode" role="group" aria-label={t('컬러 모드')}>
                <button
                  type="button"
                  className={`booth-color-mode-btn${colorMode === 'color' ? ' is-active' : ''}`}
                  disabled={session.status !== 'review'}
                  onClick={() => void selectColorMode('color')}
                >
                  {t('컬러')}
                </button>
                <button
                  type="button"
                  className={`booth-color-mode-btn${colorMode === 'monochrome' ? ' is-active' : ''}`}
                  disabled={session.status !== 'review'}
                  onClick={() => void selectColorMode('monochrome')}
                >
                  {t('흑백')}
                </button>
              </div>
            </div>
          </div>

          <div className="booth-review-layout">
            <section className="booth-review-shots" aria-label={t('촬영한 사진')}>
              <div style={{ filter: BOOTH_COLOR_MODE_FILTER[colorMode] }}>
                <ShotCandidateGrid
                  candidates={candidates}
                  selected={selected}
                  urls={urls}
                  sameSpace={sameSpaceEnabled}
                  selectable={session.status === 'review'}
                  activeShotIndex={selected[activeSlot]}
                  leftUserId={leftUserId}
                  rightUserId={rightUserId}
                  background={sameSpaceMeta.background}
                  sharedSceneId={activeSharedSceneId}
                  lightingEnabled={lightingEnabled}
                  companions={boothCompanions}
                  companionsByShot={capturedCompanionsByShot}
                  soloLayout={sameSpaceMeta.soloLayout}
                  sceneSpanMode={reviewSceneSpanMode}
                  captureViewportMode={captureViewportMode}
                  slotSubjectPlacements={Object.fromEntries(
                    candidates.map((candidate) => [
                      candidate.shotIndex,
                      modePlacementsForShot(candidate.shotIndex),
                    ]),
                  )}
                  slotFrontSubjectIds={Object.fromEntries(
                    candidates.map((candidate) => [
                      candidate.shotIndex,
                      slotFrontSubjectIdFor(
                        sameSpaceMeta,
                        candidate.shotIndex,
                        leftUserId,
                        rightUserId,
                      ),
                    ]),
                  )}
                  onToggle={onToggle}
                  onOpenPreview={(shotIndex) => setPreviewShotIndex(shotIndex)}
                  onEditComposition={(shotIndex) => openCompositionEditor(shotIndex, 'shot-card')}
                  onRetryUrl={() => void reload()}
                />
              </div>

              {selected.length > 0 ? (
                <div className="booth-review-order" style={{ marginTop: 16 }}>
                  <strong>{t('선택 순서')}</strong>
                  <ol>
                    {selected.map((index) => (
                      <li key={index} className="row" style={{ marginBottom: 6 }}>
                        <span>촬영 #{index}</span>
                        {session.status === 'review' ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              aria-label={`촬영 ${index} 위로`}
                              onClick={() => {
                                const next = moveSelectedShotUp(selected, index);
                                void persistSelection(next);
                              }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              aria-label={`촬영 ${index} 아래로`}
                              onClick={() => {
                                const next = moveSelectedShotDown(selected, index);
                                void persistSelection(next);
                              }}
                            >
                              ↓
                            </button>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </section>

            <aside className="booth-review-sidebar" aria-label={t('최종 모습')}>
              <h3 className="booth-review-sidebar-title">{t('최종 네컷 미리보기')}</h3>
              {sameSpaceEnabled ? (
                <BoothSceneSpanModePicker
                  value={reviewSceneSpanMode}
                  disabled={session.status !== 'review'}
                  onChange={(mode) => void selectSceneSpanMode(mode)}
                />
              ) : null}
              <div className="booth-color-mode booth-color-mode-inline" role="group" aria-label="색감">
                <strong>색감</strong>
                <div className="booth-span-mode-buttons">
                  <button
                    type="button"
                    className={`booth-color-mode-btn${colorMode === 'color' ? ' is-active' : ''}`}
                    disabled={session.status !== 'review'}
                    onClick={() => void selectColorMode('color')}
                  >
                    {t('컬러')}
                  </button>
                  <button
                    type="button"
                    className={`booth-color-mode-btn${colorMode === 'monochrome' ? ' is-active' : ''}`}
                    disabled={session.status !== 'review'}
                    onClick={() => void selectColorMode('monochrome')}
                  >
                    {t('흑백')}
                  </button>
                </div>
              </div>
              <p className="muted" style={{ marginTop: 8, marginBottom: 8 }}>
                {t('사진 속 사람을 직접 움직여 구도를 맞춰보세요.')}
              </p>
              <section
                ref={stripPreviewRef}
                className={`booth-editor-preview booth-editor-preview--${reviewSceneSpanMode}`}
                aria-label="최종 4컷 미리보기"
                style={{ background: activeFrame.background, color: activeFrame.ink, border: `4px solid ${activeFrame.accent}`, position: 'relative' }}
              >
                <div
                  className="booth-editor-strip"
                  data-span={reviewSceneSpanMode}
                  style={{ position: 'relative', filter: BOOTH_COLOR_MODE_FILTER[colorMode] }}
                >
                  {[0, 1, 2, 3].map((slot) => {
                    const index = selected[slot];
                    if (index === undefined) {
                      return (
                        <button
                          className={`booth-editor-slot booth-editor-slot-empty${activeSlot === slot ? ' active' : ''}`}
                          data-span={reviewSceneSpanMode}
                          key={`empty-${slot}`}
                          type="button"
                          disabled={!isHost || session.status !== 'review' || slot > selected.length}
                          onClick={() => setActiveSlot(slot)}
                        >
                          <span>{slot + 1}</span>
                          <p>{t('사진을 선택하세요')}</p>
                        </button>
                      );
                    }
                    const leftShot = findParticipantShot(shots, index, leftUserId);
                    const rightShot = findParticipantShot(shots, index, rightUserId);
                    const leftCutout = leftShot ? urls[cutoutUrlKey(leftShot.id)] : undefined;
                    const rightCutout = rightShot ? urls[cutoutUrlKey(rightShot.id)] : undefined;
                    const leftComposition = leftCutout ?? (isOurRoomBackground(sameSpaceMeta.background) && leftShot ? urls[leftShot.id] : undefined);
                    const rightComposition = rightCutout ?? (isOurRoomBackground(sameSpaceMeta.background) && rightShot ? urls[rightShot.id] : undefined);
                    const assets = resolveSameSpaceShotAssets(shots, index, session.hostUserId, session.guestUserId);
                    const showSameSpace = canShowSameSpaceLayers({
                      sameSpaceEnabled,
                      leftCutoutUrl: leftCutout,
                      rightCutoutUrl: rightCutout,
                    }) || canShowSameSpaceComposition({
                      sameSpaceEnabled,
                      hostCutoutUrl: leftCutout,
                      guestCutoutUrl: rightCutout,
                      assets,
                    }) || Boolean(isOurRoomBackground(sameSpaceMeta.background) && (leftComposition || rightComposition));
                    const crop = slotCrops[slot] ?? DEFAULT_BOOTH_CROP;
                    const personPlacements = modePlacementsForShot(index);
                    const shotFrontSubjectId = slotFrontSubjectIdFor(
                      sameSpaceMeta,
                      index,
                      leftUserId,
                      rightUserId,
                    );
                    const host = findParticipantShot(shots, index, session.hostUserId);
                    const guest = findParticipantShot(shots, index, session.guestUserId);
                    const canComposeSameSpace = showSameSpace && Boolean(leftComposition || rightComposition);
                    return (
                      <div
                        className={`booth-editor-slot${activeSlot === slot ? ' active' : ''}`}
                        data-span={reviewSceneSpanMode}
                        data-shot-index={index}
                        data-strip-slot={slot}
                        key={index}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveSlot(slot)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') setActiveSlot(slot);
                        }}
                      >
                        <span>{slot + 1}</span>
                        {showSameSpace ? (
                          <SameSpaceScenePreview
                            leftUrl={leftComposition}
                            rightUrl={rightComposition}
                            leftSubjectId={leftUserId}
                            rightSubjectId={rightUserId}
                            placementsBySubjectId={personPlacements}
                            frontSubjectId={shotFrontSubjectId}
                            background={sameSpaceMeta.background}
                            sharedSceneId={activeSharedSceneId}
                            lightingEnabled={lightingEnabled}
                            companions={companionsForShot(index)}
                            soloLayout={sameSpaceMeta.soloLayout}
                            leftTransform={{ x: crop.x, y: crop.y, scale: crop.scale }}
                            rightTransform={{ x: crop.x, y: crop.y, scale: crop.scale }}
                            leftMirror={leftShot ? (leftCutout ? sameSpaceCutoutMirrorMeta(leftShot.mirrorX) : { mirrorX: leftShot.mirrorX, mirrorBakedIntoAsset: leftShot.mirrorBakedIntoAsset }) : null}
                            rightMirror={rightShot ? (rightCutout ? sameSpaceCutoutMirrorMeta(rightShot.mirrorX) : { mirrorX: rightShot.mirrorX, mirrorBakedIntoAsset: rightShot.mirrorBakedIntoAsset }) : null}
                            sceneSpanMode={reviewSceneSpanMode}
                            captureViewportMode={captureViewportMode}
                            compactFit
                            editable={false}
                            alt={`선택 ${slot + 1}`}
                          />
                        ) : (
                          <div className="pair">
                            {host && urls[host.id] ? <img src={urls[host.id]} alt="" style={{ transform: boothCropCssTransform(crop) }} /> : null}
                            {guest && urls[guest.id] ? <img src={urls[guest.id]} alt="" style={{ transform: boothCropCssTransform(crop) }} /> : null}
                          </div>
                        )}
                        {session.status === 'review' && canComposeSameSpace ? (
                          <button
                            type="button"
                            className="btn btn-secondary booth-slot-compose-btn"
                            data-testid={`strip-compose-${slot}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveSlot(slot);
                              openCompositionEditor(index, 'final-strip', slot);
                            }}
                          >
                            {t('구도 조정')}
                          </button>
                        ) : null}
                        {session.status === 'review' && activeSlot === slot && !showSameSpace ? (
                          <div className="slot-crop-controls" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                            <p className="muted" style={{ margin: 0, fontSize: '0.7rem' }}>미세 조정 · 최종본에 반영돼요</p>
                            <label>확대<input type="range" min="0.55" max="2.2" step="0.05" value={crop.scale} onChange={(event) => { const next={...slotCrops,[slot]:{...crop,scale:Number(event.target.value)}};setSlotCrops(next);void saveComposition(frameId,next); }} /></label>
                            <label>가로<input type="range" min="-1" max="1" step="0.05" value={crop.x} onChange={(event) => { const next={...slotCrops,[slot]:{...crop,x:Number(event.target.value)}};setSlotCrops(next);void saveComposition(frameId,next); }} /></label>
                            <label>세로<input type="range" min="-1" max="1" step="0.05" value={crop.y} onChange={(event) => { const next={...slotCrops,[slot]:{...crop,y:Number(event.target.value)}};setSlotCrops(next);void saveComposition(frameId,next); }} /></label>
                            <button type="button" className="btn btn-ghost" onClick={() => { const next={...slotCrops,[slot]:DEFAULT_BOOTH_CROP};setSlotCrops(next);void saveComposition(frameId,next); }}>위치 초기화</button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="muted">선택한 4장이 최종 스트립과 같은 규칙으로 미리보기돼요.</p>
              </section>

              {sameSpaceEnabled ? (
                <>
                  <div style={{ marginTop: 16 }}>
                    <strong>{t('배경')}</strong>
                    <p className="muted">두 사람 모두 배경을 고를 수 있어요.</p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginTop: 8 }}
                      disabled={session.status !== 'review'}
                      onClick={() => setBackgroundPickerOpen((open) => !open)}
                    >
                      {t('배경 고르기')}
                    </button>
                    <SameSpaceBackgroundPicker
                      open={backgroundPickerOpen && session.status === 'review'}
                      selectedKey={isOurRoomBackground(sameSpaceMeta.background) ? undefined : backgroundKeyFromSameSpaceBackground(sameSpaceMeta.background)}
                      ourRoomSelected={isOurRoomBackground(sameSpaceMeta.background)}
                      ourRoomPreviewUrl={isOurRoomBackground(sameSpaceMeta.background) ? sameSpaceMeta.background.url : undefined}
                      includePets={ourRoomIncludesPets(sameSpaceMeta.background)}
                      preparingOurRoom={preparingOurRoom}
                      ourRoomDisabled={!canChangeBoothRoomSnapshot(session.currentShotIndex)}
                      onSelectOurRoom={() => { void selectOurRoom(true); }}
                      onIncludePetsChange={(include) => { void selectOurRoom(include); }}
                      onClose={() => setBackgroundPickerOpen(false)}
                      onSelect={(key) => {
                        void selectBackgroundKey(key);
                      }}
                    />
                  </div>
                  {isHost ? (
                    <SameSpaceBackgroundEditor
                      background={sameSpaceMeta.background}
                      frontSlot={sameSpaceMeta.frontSlot}
                      soloLayout={sameSpaceMeta.soloLayout}
                      disabled={session.status !== 'review'}
                      onBackgroundChange={(background) => {
                        const nextMeta = { ...sameSpaceMeta, background };
                        setSameSpaceMeta(nextMeta);
                        void saveComposition(frameId, slotCrops, nextMeta);
                      }}
                      onFrontSlotChange={(frontSlot) => {
                        const nextMeta = { ...sameSpaceMeta, frontSlot };
                        setSameSpaceMeta(nextMeta);
                        void saveComposition(frameId, slotCrops, nextMeta);
                      }}
                      onSoloLayoutChange={(soloLayout) => {
                        const nextMeta = { ...sameSpaceMeta, soloLayout };
                        setSameSpaceMeta(nextMeta);
                        void saveComposition(frameId, slotCrops, nextMeta);
                      }}
                      onCustomImage={async (file) => {
                        const uploaded = await uploadBoothBackgroundImage({
                          sessionId: session.id,
                          file,
                        });
                        return {
                          type: 'image',
                          presetId: `custom-${Date.now()}`,
                          url: uploaded.signedUrl,
                          storagePath: uploaded.path,
                          objectFit: 'cover',
                          positionX: 0.5,
                          positionY: 0.5,
                        } satisfies SameSpaceBackground;
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              {isExactSelection(selected) ? (
                <div style={{ marginTop: 16 }}>
                  <strong>{t('프레임')}</strong>
                  <p className="muted">{t('최종 4컷 테두리에 적용돼요.')}</p>
                  <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                    {BOOTH_FRAME_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={frameId === option.id ? 'btn btn-primary' : 'btn btn-secondary'}
                        disabled={!isHost || session.status !== 'review'}
                        onClick={() => { setFrameId(option.id); void saveComposition(option.id, slotCrops); }}
                        style={{ background: frameId === option.id ? option.accent : undefined }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <PetDecoratePanel
                    pets={pets}
                    placements={companionPlacements}
                    disabled={session.status !== 'review'}
                    onChange={updateCompanions}
                  />
                </div>
              ) : null}

              <div className="booth-review-approvals">
                <p style={{ marginTop: 12 }}>
                  승인: 호스트 {session.hostApproved ? '✓' : '…'} · 상대 {session.guestApproved ? '✓' : '…'}
                </p>
                <div className="row booth-review-actions" style={{ marginTop: 12 }}>
                  {session.status === 'review' ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!isExactSelection(selected)}
                      onClick={() => void onApprove()}
                    >
                      {t('선택 승인')}
                    </button>
                  ) : null}
                  {isHost && session.status === 'review' && session.hostApproved && isExactSelection(selected) ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={finalizing || finalizeState === 'submitting'}
                      onClick={() => void finalize(!session.guestApproved)}
                    >
                      {finalizing || finalizeState === 'submitting'
                        ? t('완성 중…')
                        : finalizeState === 'failed'
                          ? t('다시 만들기')
                          : session.guestApproved
                            ? t('최종본 만들기')
                            : t('호스트만으로 완료')}
                    </button>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>

          {finalUrl || session.status === 'completed' ? (
            <div style={{ marginTop: 24 }}>
              <h3>{t('최종본')}</h3>
              {finalUrl ? (
                <img
                  src={finalUrl}
                  alt="최종 커플 부스 사진"
                  className="booth-final-result-image"
                />
              ) : (
                <p className="muted">{t('완료됐어요.')}</p>
              )}
              {finalUrl ? (
                <div className="row" style={{ marginTop: 12 }}>
                  <a className="btn btn-primary" href={finalUrl} download="jongjong-booth.jpg">
                    {t('다운로드')}
                  </a>
                  <button type="button" className="btn btn-secondary" onClick={() => void shareFinal()}>
                    {t('공유')}
                  </button>
                  {!isGuestLinkMode && profile?.coupleId ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      data-testid="bring-booth-to-room"
                      onClick={() => {
                        setHandoffChooserOpen((open) => !open);
                        setHandoffError(null);
                      }}
                    >
                      {t('방으로 가져가기')}
                    </button>
                  ) : null}
                  <a className="btn btn-secondary" href={`lovebridge://couple-booth/result?sessionId=${encodeURIComponent(session.id)}`}>
                    {t('JONGJONG에서 열기')}
                  </a>
                </div>
              ) : null}
              {handoffChooserOpen && finalUrl ? (
                <section className="booth-room-handoff" data-testid="booth-room-source-chooser">
                  <strong>{t('방으로 가져갈 사진을 선택하세요')}</strong>
                  <p className="muted">{t('선택한 원본 사진을 우선 추천해요. 최종 네컷은 직접 선택할 때만 사용돼요.')}</p>
                  <div className="booth-room-source-grid">
                    {eligibleHandoffShots
                      .filter((shot) => Boolean(urls[shot.id]))
                      .map((shot) => {
                        const ready = handoffReadyKey === shot.id;
                        return (
                          <button
                            type="button"
                            className="booth-room-source"
                            data-testid={`bring-booth-shot-${shot.id}`}
                            key={shot.id}
                            disabled={handoffBusyKey != null}
                            onClick={() => void bringBoothSourceToRoom(shot.id)}
                          >
                            <img src={urls[shot.id]} alt={`${t('원본 사진')} #${shot.shotIndex}`} />
                            <span>#{shot.shotIndex} · {shot.userId === user?.id ? t('나') : t('상대')}</span>
                            <small>{ready ? t('iPhone에서 준비됐어요') : handoffBusyKey === shot.id ? t('보내는 중…') : t('방으로 가져가기')}</small>
                          </button>
                        );
                      })}
                    <button
                      type="button"
                      className="booth-room-source"
                      data-testid="bring-booth-final"
                      disabled={handoffBusyKey != null}
                      onClick={() => void bringBoothSourceToRoom(null)}
                    >
                      <img src={finalUrl} alt={t('최종 네컷')} />
                      <span>{t('최종 네컷')}</span>
                      <small>{handoffReadyKey === 'final' ? t('iPhone에서 준비됐어요') : handoffBusyKey === 'final' ? t('보내는 중…') : t('직접 선택')}</small>
                    </button>
                  </div>
                  {handoffReadyKey ? (
                    <p className="booth-room-ready" role="status">
                      {t('iPhone에서 준비됐어요')} · {t('JONGJONG → Room → Cutout → From Booth를 열어 주세요.')}
                    </p>
                  ) : null}
                  {handoffError ? <p className="error-text" role="alert">{handoffError}</p> : null}
                </section>
              ) : null}
              <p className="muted" style={{ marginTop: 12 }}>
                완성된 사진은 JONGJONG 추억함에 저장돼요. 컴퓨터에서는 앱을 열어 확인할 수 있어요.
              </p>
            </div>
          ) : null}

          {previewShotIndex != null ? (() => {
            const previewOrder = selectionOrderLabel(selected, previewShotIndex);
            const previewPos = candidates.findIndex((item) => item.shotIndex === previewShotIndex);
            const leftShot = findParticipantShot(shots, previewShotIndex, leftUserId);
            const rightShot = findParticipantShot(shots, previewShotIndex, rightUserId);
            const leftCutout = leftShot ? urls[cutoutUrlKey(leftShot.id)] : undefined;
            const rightCutout = rightShot ? urls[cutoutUrlKey(rightShot.id)] : undefined;
            const leftComposition = leftCutout ?? (isOurRoomBackground(sameSpaceMeta.background) && leftShot ? urls[leftShot.id] : undefined);
            const rightComposition = rightCutout ?? (isOurRoomBackground(sameSpaceMeta.background) && rightShot ? urls[rightShot.id] : undefined);
            const assets = resolveSameSpaceShotAssets(shots, previewShotIndex, session.hostUserId, session.guestUserId);
            const showSameSpace = canShowSameSpaceLayers({
              sameSpaceEnabled,
              leftCutoutUrl: leftCutout,
              rightCutoutUrl: rightCutout,
            }) || canShowSameSpaceComposition({
              sameSpaceEnabled,
              hostCutoutUrl: leftCutout,
              guestCutoutUrl: rightCutout,
              assets,
            }) || Boolean(isOurRoomBackground(sameSpaceMeta.background) && (leftComposition || rightComposition));
            const host = findParticipantShot(shots, previewShotIndex, session.hostUserId);
            const guest = findParticipantShot(shots, previewShotIndex, session.guestUserId);
            return (
              <div style={{ filter: BOOTH_COLOR_MODE_FILTER[colorMode] }}>
                <ShotLightbox
                  open
                  title={`촬영 #${previewShotIndex}`}
                  orderLabel={previewOrder}
                  selectable={session.status === 'review'}
                  selected={Boolean(previewOrder)}
                  canGoPrev={previewPos > 0}
                  canGoNext={previewPos >= 0 && previewPos < candidates.length - 1}
                  onClose={() => setPreviewShotIndex(null)}
                  onPrev={() => {
                    if (previewPos > 0) setPreviewShotIndex(candidates[previewPos - 1]!.shotIndex);
                  }}
                  onNext={() => {
                    if (previewPos >= 0 && previewPos < candidates.length - 1) {
                      setPreviewShotIndex(candidates[previewPos + 1]!.shotIndex);
                    }
                  }}
                  onToggleSelect={() => onToggle(previewShotIndex)}
                  sameSpacePreview={showSameSpace ? (
                    <SameSpaceScenePreview
                      leftUrl={leftComposition}
                      rightUrl={rightComposition}
                      leftSubjectId={leftUserId}
                      rightSubjectId={rightUserId}
                      placementsBySubjectId={modePlacementsForShot(previewShotIndex)}
                      frontSubjectId={slotFrontSubjectIdFor(
                        sameSpaceMeta,
                        previewShotIndex,
                        leftUserId,
                        rightUserId,
                      )}
                      background={sameSpaceMeta.background}
                      sharedSceneId={activeSharedSceneId}
                      lightingEnabled={lightingEnabled}
                      companions={companionsForShot(previewShotIndex)}
                      soloLayout={sameSpaceMeta.soloLayout}
                      leftMirror={leftShot ? (leftCutout ? sameSpaceCutoutMirrorMeta(leftShot.mirrorX) : { mirrorX: leftShot.mirrorX, mirrorBakedIntoAsset: leftShot.mirrorBakedIntoAsset }) : null}
                      rightMirror={rightShot ? (rightCutout ? sameSpaceCutoutMirrorMeta(rightShot.mirrorX) : { mirrorX: rightShot.mirrorX, mirrorBakedIntoAsset: rightShot.mirrorBakedIntoAsset }) : null}
                      sceneSpanMode={reviewSceneSpanMode}
                      captureViewportMode={captureViewportMode}
                      compactFit
                      alt={`촬영 ${previewShotIndex} 미리보기`}
                    />
                  ) : undefined}
                  imageUrl={
                    !showSameSpace
                      ? (host && urls[host.id]) || (guest && urls[guest.id]) || undefined
                      : undefined
                  }
                />
              </div>
            );
          })() : null}
        </div>
      ) : null}

      {compositionEditTarget != null && session.status === 'review' ? (() => {
        const { shotIndex } = compositionEditTarget;
        const leftShot = findParticipantShot(shots, shotIndex, leftUserId);
        const rightShot = findParticipantShot(shots, shotIndex, rightUserId);
        const leftCutout = leftShot ? urls[cutoutUrlKey(leftShot.id)] : undefined;
        const rightCutout = rightShot ? urls[cutoutUrlKey(rightShot.id)] : undefined;
        const leftComposition = leftCutout ?? (isOurRoomBackground(sameSpaceMeta.background) && leftShot ? urls[leftShot.id] : undefined);
        const rightComposition = rightCutout ?? (isOurRoomBackground(sameSpaceMeta.background) && rightShot ? urls[rightShot.id] : undefined);
        const placements = modePlacementsForShot(shotIndex);
        const frontSubjectId = slotFrontSubjectIdFor(
          sameSpaceMeta,
          shotIndex,
          leftUserId,
          rightUserId,
        );
        const title = compositionEditorTitle(compositionEditTarget);
        return (
          <SameSpaceCompositionEditor
            open
            title={title}
            leftUrl={leftComposition}
            rightUrl={rightComposition}
            leftSubjectId={leftUserId}
            rightSubjectId={rightUserId}
            localSubjectId={user?.id ?? leftUserId}
            localSlot={participantSlots?.localSlot ?? 'left'}
            background={sameSpaceMeta.background}
            sharedSceneId={activeSharedSceneId}
            lightingEnabled={lightingEnabled}
            companions={companionsForShot(shotIndex)}
            companionPlacements={companionPlacements}
            onCompanionPlacementsChange={updateCompanions}
            soloLayout={sameSpaceMeta.soloLayout}
            initialPlacements={placements}
            initialFrontSubjectId={frontSubjectId}
            colorFilter={BOOTH_COLOR_MODE_FILTER[colorMode]}
            sceneSpanMode={reviewSceneSpanMode}
            captureViewportMode={captureViewportMode}
            leftMirror={leftShot ? (leftCutout ? sameSpaceCutoutMirrorMeta(leftShot.mirrorX) : { mirrorX: leftShot.mirrorX, mirrorBakedIntoAsset: leftShot.mirrorBakedIntoAsset }) : null}
            rightMirror={rightShot ? (rightCutout ? sameSpaceCutoutMirrorMeta(rightShot.mirrorX) : { mirrorX: rightShot.mirrorX, mirrorBakedIntoAsset: rightShot.mirrorBakedIntoAsset }) : null}
            onClose={closeCompositionEditor}
            onSave={(nextPlacements, nextFrontSubjectId) => {
              saveShotSubjectPlacements(shotIndex, nextPlacements, nextFrontSubjectId);
              closeCompositionEditor();
            }}
          />
        );
      })() : null}

      {['declined', 'cancelled', 'expired', 'failed'].includes(session.status) ? (
        <div className="card" style={{ marginTop: 20 }}>
          <p className="error-text">This photo session has ended.</p>
          {session.errorReason ? <p className="muted">{session.errorReason}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
