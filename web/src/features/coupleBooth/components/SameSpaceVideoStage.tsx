import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { RoomEvent, Track, type Room } from 'livekit-client';
import { DEFAULT_SAME_SPACE_BACKGROUND, type SameSpaceBackground } from '@shared/sameSpaceBackground';
import {
  computeSameSpacePersonPlacement,
  smoothPersonBounds,
  type SameSpaceNormalizedTransform,
  type SameSpacePersonBounds,
} from '@shared/sameSpaceComposition';
import {
  createFitScaleLockState,
  resolveFitPersonHeightNorm,
  updateFitScaleLock,
  type FitScaleLockState,
} from '@shared/sameSpaceFitScale';
import {
  DEFAULT_SAME_SPACE_FRONT,
  DEFAULT_SAME_SPACE_MANUAL_OFFSET,
  DEFAULT_SAME_SPACE_SOLO_LAYOUT,
  clampManualOffset,
  computeDampedCentroidAssistX,
  detectBoundsEdgeTouch,
  resolveSessionParticipantSlots,
  smoothMotionOffset,
  SAME_SPACE_MANUAL_SCALE_CLAMP,
  type SameSpaceCompositionSlot,
  type SameSpaceFrontPreference,
  type SameSpaceManualOffset,
  type SameSpaceSoloLayout,
} from '@shared/sameSpaceLayoutSpec';
import { partnerUserIdForLocal } from '@shared/sameSpaceStageLayout';
import {
  LIVE_CAPTURE_SCENE_SPAN_MODE,
  fitBoothSceneCssSize,
  sceneSpecForSpanMode,
  type CaptureViewportMode,
  type BoothSceneSpanMode,
} from '@shared/boothSceneSpec';
import {
  createMaskGateState,
  shouldAcceptLiveMask,
  type MaskGateState,
} from '@shared/liveMaskGate';
import { DEFAULT_BOOTH_PARTICIPANT_VISUAL, resolveBoothParticipantVisual } from '@shared/stage';
import {
  commitSegmentedSourceOutput,
  createSegmentedSourceOutput,
  isForegroundReconnecting,
  isForegroundStale,
  renderSameSpaceCompositionFrame,
  type SegmentedSourceOutput,
} from '../composition/sameSpaceCanvasRenderer';
import {
  advanceCompositorDrawState,
  createEmptyCompositorDrawState,
  resolveActiveForegroundOutput,
  snapshotAuthoritativeComposite,
  type SameSpaceCompositorDrawState,
  type SameSpaceWysiwygCaptureResult,
} from '../composition/sameSpaceLiveCapture';
import { usePartnerCameraTrack } from '../hooks/usePartnerCameraTrack';
import type { WebLiveKitCoupleBoothMediaService } from '../media/WebLiveKitCoupleBoothMediaService';
import type { BoothCameraVisualState } from '../media/types';
import {
  disposeLiveSegmenter,
  ensureLiveSegmenterReady,
  getLiveSegmenterBusyAgeMs,
  recreateLiveSegmenterIfStuck,
  releaseLiveSegmenter,
  segmentVideoFrame,
} from '../segmentation/LivePersonSegmenter';
import {
  createEmptySourceDebug,
  isSameSpaceDebugEnabled,
  shortId,
  type SameSpaceSourceDebugSnapshot,
} from '../segmentation/sameSpacePipelineDebug';
import {
  resolveForegroundPlaceholderReason,
  resolveForegroundStatus,
  shouldShowWarmupPlaceholder,
  type ForegroundStatus,
} from '../utils/sameSpaceForegroundStatus';
import { createFairFrameScheduler } from '../segmentation/segmentScheduler';
import {
  ensureVideoInstanceId,
  isVideoFrameUsable,
  startVideoFramePump,
  type SameSpaceSourceId,
  type VideoFramePumpState,
} from '../segmentation/videoFramePump';
import {
  evaluateSourcePipelineReadiness,
  shouldRebindForTrackSidChange,
  shouldReuseSourcePump,
} from '../segmentation/sourcePipelineReady';
import {
  SOURCE_HEARTBEAT_MS,
  decideSourceRecovery,
} from '../segmentation/sourceLivenessHeartbeat';
import {
  classifyRemoteStall,
  createSourceSoakRing,
  describeCounterProgress,
  type SourceSoakSample,
} from '../segmentation/remoteSourceSoak';
import type { CouplePoseId, CouplePoseRole } from '@shared/poseGuide';
import { CouplePoseGuideOverlay } from './CouplePoseGuideOverlay';
import type { BoothSharedSceneId } from '@shared/sharedScene';
import {
  IDENTITY_BOOTH_PARTICIPANT_LIGHTING,
  resolveBoothPairLighting,
  type BoothForegroundLightingStatistics,
  type BoothPairLighting,
  type BoothParticipantLighting,
} from '@shared/participantLighting';
import { measureForegroundLightingSource } from '../composition/participantLightingCanvas';

export type SameSpaceLiveCaptureHandle = {
  captureWysiwyg: (options?: {
    /** Exact, already-resolved shutter presentation for this captured frame. */
    companions?: import('@shared/coupleBoothStage').BoothCompanionSnapshot[];
  }) => Promise<SameSpaceWysiwygCaptureResult>;
  getDebugVersions: () => {
    localCommitVersion: number;
    remoteCommitVersion: number;
    localDrawnVersion: number;
    remoteDrawnVersion: number;
    compositeGeneration: number;
    lastCompositorFrameMs: number;
    captureVersion: SameSpaceWysiwygCaptureResult['captureVersion'] | null;
  };
};
/**
 * Production Same Space never paints raw rectangular video.
 * DEV + ?sameSpaceDebug=1 may opt into raw for instrumentation only.
 */
export function resolveSameSpaceLayerDisplay(input: {
  hasCommittedForeground: boolean;
  foregroundFresh: boolean;
  reconnecting: boolean;
  rawUsable: boolean;
  allowDebugRawVideo: boolean;
  hasRemoteExpectation: boolean;
  /** Optional status — when ready/recovering, never force silhouette. */
  status?: ForegroundStatus;
}): {
  preferRawVideo: boolean;
  showLoadingSilhouette: boolean;
  showReconnecting: boolean;
} {
  if (input.allowDebugRawVideo && input.rawUsable && input.hasCommittedForeground && !input.foregroundFresh) {
    return {
      preferRawVideo: true,
      showLoadingSilhouette: false,
      showReconnecting: false,
    };
  }
  if (input.hasCommittedForeground) {
    return {
      preferRawVideo: false,
      showLoadingSilhouette: false,
      showReconnecting: input.reconnecting,
    };
  }
  const status = input.status
    ?? (input.hasRemoteExpectation ? 'warmingUp' : 'waitingForTrack');
  return {
    preferRawVideo: false,
    // Warm-up only — never gate on background / partner position / RPC.
    showLoadingSilhouette: shouldShowWarmupPlaceholder(status) && input.hasRemoteExpectation,
    showReconnecting: false,
  };
}

/** @deprecated Use resolveSameSpaceLayerDisplay — production never prefers raw. */
export function shouldPreferRawVideoFallback(input: {
  hasCommittedForeground: boolean;
  foregroundFresh: boolean;
  rawUsable: boolean;
  allowDebugRawVideo?: boolean;
}): boolean {
  return resolveSameSpaceLayerDisplay({
    hasCommittedForeground: input.hasCommittedForeground,
    foregroundFresh: input.foregroundFresh,
    reconnecting: false,
    rawUsable: input.rawUsable,
    allowDebugRawVideo: Boolean(input.allowDebugRawVideo),
    hasRemoteExpectation: true,
  }).preferRawVideo;
}

/** True when the remote <video> has a live attached MediaStreamTrack (no React lag). */
export function isRemoteVideoSourceLive(video: HTMLVideoElement | null): boolean {
  if (!video?.srcObject) return false;
  const stream = video.srcObject;
  if (!(stream instanceof MediaStream)) return false;
  return stream.getVideoTracks().some((track) => track.readyState === 'live');
}

type Props = {
  companions?: import('@shared/coupleBoothStage').BoothCompanionSnapshot[];
  room: Room | null;
  media: WebLiveKitCoupleBoothMediaService | null;
  trackEpoch: number;
  hostUserId: string;
  guestUserId: string;
  localUserId: string;
  localVisual: BoothCameraVisualState;
  remoteConnected: boolean;
  background?: SameSpaceBackground;
  frontSlot?: SameSpaceFrontPreference;
  soloLayout?: SameSpaceSoloLayout;
  /** Live composition frame — must match Review/export sceneSpanMode aspect. */
  sceneSpanMode?: BoothSceneSpanMode;
  captureViewportMode?: CaptureViewportMode;
  personTransforms?: Partial<Record<SameSpaceCompositionSlot, SameSpaceNormalizedTransform>>;
  /** Manual drag offsets keyed by participant user id. */
  participantTransforms?: Record<string, SameSpaceManualOffset>;
  leftParticipantId?: string | null;
  rightParticipantId?: string | null;
  /** Imperative WYSIWYG capture — same canvas the user sees. */
  captureHandleRef?: MutableRefObject<SameSpaceLiveCaptureHandle | null>;
  onLocalTransformPreview?: (offset: SameSpaceManualOffset) => void;
  onLocalTransformCommit?: (offset: SameSpaceManualOffset) => void;
  /** Preview-only DOM overlay. It is deliberately outside the captured compositor canvas. */
  poseGuide?: {
    poseId: CouplePoseId;
    localRole: CouplePoseRole | null;
    localStageSide: 'left' | 'right' | null;
    mode: 'full' | 'countdown' | 'hidden';
  };
  sharedSceneId?: BoothSharedSceneId;
  lightingEnabled?: boolean;
};

type PersonRuntime = {
  bounds: SameSpacePersonBounds | null;
  sourceWidth: number;
  sourceHeight: number;
  consecutiveFailures: number;
  motionOffsetX: number;
  fitScale: FitScaleLockState;
};

const RENDER_FPS = 30;

function emptyRuntime(): PersonRuntime {
  return {
    bounds: null,
    sourceWidth: 0,
    sourceHeight: 0,
    consecutiveFailures: 0,
    motionOffsetX: 0,
    fitScale: createFitScaleLockState(),
  };
}

function centroidXFromBounds(bounds: SameSpacePersonBounds | null): number | null {
  if (!bounds) return null;
  return (bounds.minX + bounds.maxX) / 2;
}

function visualFromMetadata(metadata: string | undefined) {
  try {
    return resolveBoothParticipantVisual(JSON.parse(metadata ?? ''));
  } catch {
    return DEFAULT_BOOTH_PARTICIPANT_VISUAL;
  }
}

function readTrackDebug(
  room: Room | null,
  which: SameSpaceSourceId,
  partnerId: string | null,
): Pick<
  SameSpaceSourceDebugSnapshot,
  | 'identityShort'
  | 'trackSidShort'
  | 'publicationSidShort'
  | 'trackMuted'
  | 'trackSubscribed'
  | 'mediaTrackReadyState'
  | 'mediaTrackMuted'
> {
  const empty = {
    identityShort: '-',
    trackSidShort: '-',
    publicationSidShort: '-',
    trackMuted: null as boolean | null,
    trackSubscribed: null as boolean | null,
    mediaTrackReadyState: '-',
    mediaTrackMuted: null as boolean | null,
  };
  if (!room) return empty;
  if (which === 'local') {
    const participant = room.localParticipant;
    const pub = participant.getTrackPublication(Track.Source.Camera);
    const mediaTrack = pub?.track?.mediaStreamTrack;
    return {
      identityShort: shortId(participant.identity),
      trackSidShort: shortId(pub?.track?.sid ?? pub?.trackSid),
      publicationSidShort: shortId(pub?.trackSid),
      trackMuted: pub ? pub.isMuted : null,
      trackSubscribed: pub ? true : null,
      mediaTrackReadyState: mediaTrack?.readyState ?? '-',
      mediaTrackMuted: mediaTrack ? mediaTrack.muted : null,
    };
  }
  if (!partnerId) return empty;
  const participant = room.remoteParticipants.get(partnerId);
  const pub = participant?.getTrackPublication(Track.Source.Camera);
  const mediaTrack = pub?.track?.mediaStreamTrack;
  return {
    identityShort: shortId(participant?.identity ?? partnerId),
    trackSidShort: shortId(pub?.track?.sid ?? pub?.trackSid),
    publicationSidShort: shortId(pub?.trackSid),
    trackMuted: pub ? pub.isMuted : null,
    trackSubscribed: pub ? pub.isSubscribed : null,
    mediaTrackReadyState: mediaTrack?.readyState ?? '-',
    mediaTrackMuted: mediaTrack ? mediaTrack.muted : null,
  };
}

/**
 * Live Same Space stage: hidden local/remote videos + one composition canvas.
 *
 * Host/guest (creator) only affects editing permissions elsewhere — this stage
 * always runs the same local/remote pumps, fair scheduler, and renderer.
 * Composition props (background, frontSlot, …) are read from refs so changing
 * them never remounts video elements or detaches LiveKit tracks.
 */
export function SameSpaceVideoStage({
  room,
  media,
  trackEpoch,
  hostUserId,
  guestUserId,
  localUserId,
  localVisual,
  remoteConnected,
  background = DEFAULT_SAME_SPACE_BACKGROUND,
  frontSlot = DEFAULT_SAME_SPACE_FRONT,
  soloLayout = DEFAULT_SAME_SPACE_SOLO_LAYOUT,
  sceneSpanMode = LIVE_CAPTURE_SCENE_SPAN_MODE,
  captureViewportMode = 'desktop',
  personTransforms,
  participantTransforms,
  leftParticipantId = null,
  rightParticipantId = null,
  captureHandleRef,
  onLocalTransformPreview,
  onLocalTransformCommit,
  poseGuide,
  sharedSceneId = 'classic',
  lightingEnabled = true,
  companions = [],
}: Props) {
  const slots = resolveSessionParticipantSlots({
    localUserId,
    hostUserId,
    guestUserId,
    leftParticipantId,
    rightParticipantId,
  });
  const localSlot = slots.localSlot;
  const partnerId = partnerUserIdForLocal(localUserId, hostUserId, guestUserId);
  const localRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const remoteAttachNotifyRef = useRef<(() => void) | null>(null);
  const { videoRef: remoteRef, hasRemoteTrack, getAttachment } = usePartnerCameraTrack({
    room,
    partnerUserId: partnerId,
    onAttached: () => {
      remoteAttachNotifyRef.current?.();
    },
  });
  const remoteVideoElRef = useRef<HTMLVideoElement | null>(null);
  const mountGeneration = useRef(0);
  const segmentedOutputGeneration = useRef(0);
  const debugEnabled = isSameSpaceDebugEnabled();
  const allowDebugRawVideo = Boolean(import.meta.env.DEV) && debugEnabled;
  const debugRef = useRef({
    local: createEmptySourceDebug('local'),
    remote: createEmptySourceDebug('remote'),
  });
  const soakRingRef = useRef(createSourceSoakRing(180));
  const soakCountersRef = useRef({
    heartbeatTick: 0,
    forcedEnqueue: { local: 0, remote: 0 },
    attachCount: { local: 0, remote: 0 },
    detachCount: { local: 0, remote: 0 },
    restartCount: { local: 0, remote: 0 },
    roomConnectCount: 0,
    roomDisconnectCount: 0,
    prev: {
      local: null as null | {
        videoCurrentTime: number;
        enqueue: number;
        segmentOk: number;
        commit: number;
        drawn: number;
        contentRevision: number;
      },
      remote: null as null | {
        videoCurrentTime: number;
        enqueue: number;
        segmentOk: number;
        commit: number;
        drawn: number;
        contentRevision: number;
      },
    },
  });
  const [soakStallHint, setSoakStallHint] = useState<string | null>(null);  const pumpStateRef = useRef<{
    local: VideoFramePumpState | null;
    remote: VideoFramePumpState | null;
  }>({ local: null, remote: null });
  const [debugHud, setDebugHud] = useState<{
    local: SameSpaceSourceDebugSnapshot;
    remote: SameSpaceSourceDebugSnapshot;
  } | null>(null);
  const [layoutDebug, setLayoutDebug] = useState<string | null>(null);
  const [cameraEdgeHint, setCameraEdgeHint] = useState(false);
  const [warmUpHint, setWarmUpHint] = useState(false);
  const layoutDebugRef = useRef<string>('');
  const cameraEdgeHintRef = useRef(false);
  const warmUpHintRef = useRef(false);
  const dragRef = useRef<
    | {
      mode: 'move';
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startOffset: SameSpaceManualOffset;
    }
    | {
      mode: 'resize';
      pointerId: number;
      startOffset: SameSpaceManualOffset;
      startDist: number;
      centerX: number;
      centerY: number;
    }
    | {
      mode: 'pinch';
      startOffset: SameSpaceManualOffset;
      startDist: number;
      pointers: Map<number, { x: number; y: number }>;
    }
    | null
  >(null);
  const localPlacementRef = useRef<{
    dest: { x: number; y: number; width: number; height: number };
    personDest: { x: number; y: number; width: number; height: number };
    canvasWidth: number;
    canvasHeight: number;
  } | null>(null);
  const liveManualOffsetRef = useRef<SameSpaceManualOffset | null>(null);
  const previewThrottleRef = useRef(0);

  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [metadataEpoch, setMetadataEpoch] = useState(0);
  const leftRuntime = useRef<PersonRuntime>(emptyRuntime());
  const rightRuntime = useRef<PersonRuntime>(emptyRuntime());
  const localSegmentedCanvas = useRef<SegmentedSourceOutput | null>(null);
  const remoteSegmentedCanvas = useRef<SegmentedSourceOutput | null>(null);
  const localMaskGateRef = useRef<MaskGateState>(createMaskGateState());
  const remoteMaskGateRef = useRef<MaskGateState>(createMaskGateState());
  const compositorDrawRef = useRef<SameSpaceCompositorDrawState>(createEmptyCompositorDrawState());
  const lastCaptureVersionRef = useRef<SameSpaceWysiwygCaptureResult['captureVersion'] | null>(null);
  const outputGenerationLiveRef = useRef(0);
  const liveLightingRef = useRef<BoothPairLighting>({
    participantA: { ...IDENTITY_BOOTH_PARTICIPANT_LIGHTING },
    participantB: { ...IDENTITY_BOOTH_PARTICIPANT_LIGHTING },
  });
  const lightingSamplesRef = useRef<{
    left: BoothForegroundLightingStatistics[];
    right: BoothForegroundLightingStatistics[];
  }>({ left: [], right: [] });

  // Live composition knobs — never put these in the pipeline effect deps.
  // partnerId / hasRemoteTrack flipping (host waits in Same Space, then guest
  // joins) used to remount pumps and freeze the first remote foreground.
  const compositionRef = useRef({
    background,
    frontSlot,
    soloLayout,
    sceneSpanMode: LIVE_CAPTURE_SCENE_SPAN_MODE,
    captureViewportMode,
    personTransforms,
    participantTransforms: participantTransforms ?? {},
    localVisual,
    remoteVisual: DEFAULT_BOOTH_PARTICIPANT_VISUAL,
    hasRemoteTrack,
    localSlot,
    partnerId,
    leftUserId: slots.leftUserId,
    rightUserId: slots.rightUserId,
    localUserId,
    sharedSceneId,
    lightingEnabled,
    companions,
    backgroundImage: null as HTMLImageElement | null,
    foregroundImage: null as HTMLImageElement | null,
  });
  compositionRef.current.background = background;
  compositionRef.current.frontSlot = frontSlot;
  compositionRef.current.soloLayout = soloLayout;
  compositionRef.current.sceneSpanMode = LIVE_CAPTURE_SCENE_SPAN_MODE;
  compositionRef.current.captureViewportMode = captureViewportMode;
  void sceneSpanMode;
  compositionRef.current.personTransforms = personTransforms;
  compositionRef.current.participantTransforms = participantTransforms ?? {};
  compositionRef.current.localVisual = localVisual;
  compositionRef.current.hasRemoteTrack = hasRemoteTrack;
  compositionRef.current.localSlot = localSlot;
  compositionRef.current.partnerId = partnerId;
  compositionRef.current.leftUserId = slots.leftUserId;
  compositionRef.current.rightUserId = slots.rightUserId;
  compositionRef.current.localUserId = localUserId;
  compositionRef.current.sharedSceneId = sharedSceneId;
  compositionRef.current.lightingEnabled = lightingEnabled;
  compositionRef.current.companions = companions;

  useEffect(() => {
    let cancelled = false;
    const load = async (url: string | undefined): Promise<HTMLImageElement | null> => {
      if (!url) return null;
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(cancelled ? null : img);
        img.onerror = () => resolve(null);
        img.src = url;
      });
    };
    if (background.type !== 'image') {
      compositionRef.current.backgroundImage = null;
      compositionRef.current.foregroundImage = null;
      return () => { cancelled = true; };
    }
    void Promise.all([load(background.url), load(background.frontUrl)]).then(([back, front]) => {
      if (cancelled) return;
      compositionRef.current.backgroundImage = back;
      compositionRef.current.foregroundImage = front;
    });
    return () => { cancelled = true; };
  }, [background]);

  useEffect(() => {
    const identity = () => ({
      participantA: { ...IDENTITY_BOOTH_PARTICIPANT_LIGHTING },
      participantB: { ...IDENTITY_BOOTH_PARTICIPANT_LIGHTING },
    });
    if (!lightingEnabled) {
      lightingSamplesRef.current = { left: [], right: [] };
      liveLightingRef.current = identity();
      return;
    }
    const average = (rows: BoothForegroundLightingStatistics[]): BoothForegroundLightingStatistics | null => {
      if (rows.length < 3) return null;
      const count = rows.length;
      return {
        luminance: rows.reduce((sum, row) => sum + row.luminance, 0) / count,
        warmth: rows.reduce((sum, row) => sum + row.warmth, 0) / count,
        saturation: rows.reduce((sum, row) => sum + row.saturation, 0) / count,
        foregroundPixelCount: Math.round(rows.reduce((sum, row) => sum + row.foregroundPixelCount, 0) / count),
        confidence: rows.reduce((sum, row) => sum + row.confidence, 0) / count,
      };
    };
    const blend = (current: BoothParticipantLighting, next: BoothParticipantLighting): BoothParticipantLighting => ({
      ...next,
      brightness: current.enabled ? current.brightness * 0.75 + next.brightness * 0.25 : next.brightness,
      warmth: current.enabled ? current.warmth * 0.75 + next.warmth * 0.25 : next.warmth,
    });
    const timer = window.setInterval(() => {
      const slot = compositionRef.current.localSlot;
      if (!slot) return;
      const localStats = measureForegroundLightingSource(localSegmentedCanvas.current?.canvas);
      const remoteStats = measureForegroundLightingSource(remoteSegmentedCanvas.current?.canvas);
      const leftStats = slot === 'left' ? localStats : remoteStats;
      const rightStats = slot === 'right' ? localStats : remoteStats;
      if (leftStats) lightingSamplesRef.current.left.push(leftStats);
      if (rightStats) lightingSamplesRef.current.right.push(rightStats);
      lightingSamplesRef.current.left = lightingSamplesRef.current.left.slice(-5);
      lightingSamplesRef.current.right = lightingSamplesRef.current.right.slice(-5);
      const resolved = resolveBoothPairLighting(
        average(lightingSamplesRef.current.left),
        average(lightingSamplesRef.current.right),
        compositionRef.current.sharedSceneId,
        compositionRef.current.lightingEnabled,
      );
      liveLightingRef.current = {
        participantA: blend(liveLightingRef.current.participantA, resolved.participantA),
        participantB: blend(liveLightingRef.current.participantB, resolved.participantB),
      };
    }, 900);
    return () => window.clearInterval(timer);
  }, [lightingEnabled]);

  // Mode change must resize backing store without remounting segmentation.
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !modelReady) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fitted = fitBoothSceneCssSize(rect.width, rect.height || rect.width, LIVE_CAPTURE_SCENE_SPAN_MODE, captureViewportMode);
    const width = Math.max(1, Math.round(fitted.cssWidth * dpr));
    const height = Math.max(1, Math.round(fitted.cssHeight * dpr));
    if (Math.abs(canvas.width - width) < 2 && Math.abs(canvas.height - height) < 2) return;
    canvas.width = width;
    canvas.height = height;
    canvasCtxRef.current = canvas.getContext('2d');
  }, [captureViewportMode, modelReady]);

  // Drop ephemeral drag offset once authoritative props catch up.
  useEffect(() => {
    const live = liveManualOffsetRef.current;
    if (!live || !localUserId) return;
    const authoritative = participantTransforms?.[localUserId];
    if (!authoritative) return;
    if (
      Math.abs(authoritative.offsetX - live.offsetX) < 0.001
      && Math.abs(authoritative.offsetY - live.offsetY) < 0.001
      && Math.abs(authoritative.scale - live.scale) < 0.001
    ) {
      liveManualOffsetRef.current = null;
    }
  }, [participantTransforms, localUserId]);

  const setRemoteNode = useCallback((node: HTMLVideoElement | null) => {
    remoteVideoElRef.current = node;
    remoteRef(node);
    // Ref may arrive after track-already-present attach intent — kick maybeStart.
    remoteAttachNotifyRef.current?.();
  }, [remoteRef]);

  const getAttachmentRef = useRef(getAttachment);
  getAttachmentRef.current = getAttachment;

  useEffect(() => {
    if (!room) return;
    const refresh = () => setMetadataEpoch((value) => value + 1);
    room.on(RoomEvent.ParticipantMetadataChanged, refresh);
    return () => { room.off(RoomEvent.ParticipantMetadataChanged, refresh); };
  }, [room]);

  const remoteVisual = visualFromMetadata(room?.remoteParticipants.get(partnerId ?? '')?.metadata);
  compositionRef.current.remoteVisual = remoteVisual;
  void metadataEpoch;

  useEffect(() => {
    const el = localRef.current;
    media?.setLocalVideoElement(el);
    return () => {
      media?.clearLocalVideoElement(el);
    };
  }, [media, trackEpoch]);

  useEffect(() => {
    let cancelled = false;
    const generation = ++mountGeneration.current;
    void ensureLiveSegmenterReady()
      .then(() => {
        if (cancelled || mountGeneration.current !== generation) return;
        setModelReady(true);
        setModelError(false);
      })
      .catch(() => {
        if (cancelled || mountGeneration.current !== generation) return;
        setModelReady(false);
        setModelError(true);
      });
    return () => {
      cancelled = true;
      releaseLiveSegmenter();
    };
  }, [retryToken]);

  // Clear remote foreground when the partner track disappears — do NOT remount
  // the whole pipeline (that was detaching pumps and freezing host remote motion).
  useEffect(() => {
    if (hasRemoteTrack) return;
    const output = remoteSegmentedCanvas.current;
    if (output) {
      output.revision = 0;
      output.lastValidAtMs = 0;
      if (output.canvas.width > 0) {
        output.context.clearRect(0, 0, output.canvas.width, output.canvas.height);
      }
    }
    const remoteSlot = localSlot === 'left' ? 'right' : localSlot === 'right' ? 'left' : null;
    if (remoteSlot === 'left') leftRuntime.current = emptyRuntime();
    if (remoteSlot === 'right') rightRuntime.current = emptyRuntime();
  }, [hasRemoteTrack, localSlot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !localSlot || !modelReady) return;

    let disposed = false;
    let raf = 0;
    let hudRaf = 0;
    let lastRenderMs = 0;
    const outputGeneration = ++segmentedOutputGeneration.current;
    outputGenerationLiveRef.current = outputGeneration;
    canvasCtxRef.current = canvas.getContext('2d');
    localSegmentedCanvas.current = createSegmentedSourceOutput(outputGeneration);
    remoteSegmentedCanvas.current = createSegmentedSourceOutput(outputGeneration);
    compositorDrawRef.current = createEmptyCompositorDrawState();
    lastCaptureVersionRef.current = null;
    leftRuntime.current = emptyRuntime();
    rightRuntime.current = emptyRuntime();
    debugRef.current = {
      local: createEmptySourceDebug('local'),
      remote: createEmptySourceDebug('remote'),
    };

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const span = LIVE_CAPTURE_SCENE_SPAN_MODE;
      // Letterbox into the stage box — external frame is always 4:3 (two_cell).
      // (one_cell 2:3, two_cell 4:3) — never stretch or inherit viewport aspect.
      const fitted = fitBoothSceneCssSize(rect.width, rect.height || rect.width, span, compositionRef.current.captureViewportMode);
      const width = Math.max(1, Math.round(fitted.cssWidth * dpr));
      const height = Math.max(1, Math.round(fitted.cssHeight * dpr));
      // Integer hysteresis: ignore 1px observer jitter that would clear the canvas.
      if (
        Math.abs(canvas.width - width) >= 2
        || Math.abs(canvas.height - height) >= 2
      ) {
        canvas.width = width;
        canvas.height = height;
        canvasCtxRef.current = canvas.getContext('2d');
      } else if (canvas.width <= 0 || canvas.height <= 0) {
        canvas.width = width;
        canvas.height = height;
        canvasCtxRef.current = canvas.getContext('2d');
      }
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    const slotForSource = (which: SameSpaceSourceId): SameSpaceCompositionSlot | null => {
      const slot = compositionRef.current.localSlot;
      if (!slot) return null;
      if (which === 'local') return slot;
      return slot === 'left' ? 'right' : 'left';
    };

    const bumpDebug = (which: SameSpaceSourceId, mutate: (row: SameSpaceSourceDebugSnapshot) => void) => {
      mutate(debugRef.current[which]);
    };

    const isRemoteLive = () => (
      compositionRef.current.hasRemoteTrack
      || isRemoteVideoSourceLive(remoteVideoElRef.current)
      || getAttachmentRef.current().attached
    );

    const applySegment = (
      which: SameSpaceSourceId,
      result: Awaited<ReturnType<typeof segmentVideoFrame>>,
      requestedMediaTime: number,
    ) => {
      if (disposed) return;
      if (which === 'remote' && !isRemoteLive()) return;
      const slot = slotForSource(which);
      if (!slot) return;
      const runtime = slot === 'left' ? leftRuntime : rightRuntime;
      const output = which === 'local' ? localSegmentedCanvas.current : remoteSegmentedCanvas.current;
      if (!output) {
        bumpDebug(which, (row) => { row.inferenceFailure += 1; });
        return;
      }
      if (output.generation !== outputGeneration) {
        bumpDebug(which, (row) => { row.staleGenerationDrops += 1; });
        return;
      }
      if (result?.mask.valid && result.mask.bounds) {
        const gate = which === 'local' ? localMaskGateRef.current : remoteMaskGateRef.current;
        const area = Math.max(
          0.01,
          (result.mask.bounds.maxX - result.mask.bounds.minX)
            * (result.mask.bounds.maxY - result.mask.bounds.minY),
        );
        const decision = shouldAcceptLiveMask(gate, {
          areaRatio: area,
          minY: result.mask.bounds.minY,
          maxY: result.mask.bounds.maxY,
          minX: result.mask.bounds.minX,
          maxX: result.mask.bounds.maxX,
          personPixels: Math.round(area * result.inferWidth * result.inferHeight),
        });
        if (!decision.accept) {
          bumpDebug(which, (row) => { row.inferenceFailure += 1; });
          return;
        }
      }
      if (result?.mask.valid && result.mask.bounds && commitSegmentedSourceOutput(output, result, outputGeneration)) {
        bumpDebug(which, (row) => {
          row.inferenceSuccess += 1;
          row.committed += 1;
          row.revision = output.revision;
          row.lastCommittedMediaTime = requestedMediaTime;
          row.lastCommittedAtMs = performance.now();
        });
        const nextBounds = smoothPersonBounds(runtime.current.bounds, result.mask.bounds);
        const edgeTouch = detectBoundsEdgeTouch(nextBounds);
        const centroid = centroidXFromBounds(nextBounds);
        const mirrorDisplay = which === 'local'
          ? compositionRef.current.localVisual.mirrorX
          : compositionRef.current.remoteVisual.mirrorX;
        const assist = computeDampedCentroidAssistX(slot, centroid, mirrorDisplay, edgeTouch);
        const nowMs = performance.now();
        const fitScale = updateFitScaleLock(runtime.current.fitScale, nextBounds, nowMs);
        runtime.current = {
          bounds: nextBounds,
          sourceWidth: result.sourceWidth,
          sourceHeight: result.sourceHeight,
          consecutiveFailures: 0,
          motionOffsetX: smoothMotionOffset(runtime.current.motionOffsetX, assist),
          fitScale,
        };
        return;
      }
      bumpDebug(which, (row) => { row.inferenceFailure += 1; });
      const failures = runtime.current.consecutiveFailures + 1;
      // Only treat sustained absence as a miss — single-frame inference failures
      // must not unlock fit scale (that reintroduces zoom oscillation).
      const fitScale = failures >= 8
        ? updateFitScaleLock(runtime.current.fitScale, null, performance.now())
        : runtime.current.fitScale;
      runtime.current = {
        ...runtime.current,
        sourceWidth: result?.sourceWidth || runtime.current.sourceWidth,
        sourceHeight: result?.sourceHeight || runtime.current.sourceHeight,
        consecutiveFailures: failures,
        fitScale,
      };
    };

    const lastRequestedMediaTime = {
      local: Number.NaN,
      remote: Number.NaN,
    };

    const frameScheduler = createFairFrameScheduler(['local', 'remote'] as const, {
      starveAfterMs: 100,
    });
    frameScheduler.start(async (which) => {
      bumpDebug(which, (row) => { row.submitted += 1; });
      if (disposed || document.hidden) return;
      if (which === 'remote' && !isRemoteLive()) return;
      const video = which === 'local' ? localRef.current : remoteVideoElRef.current;
      if (!video || !isVideoFrameUsable(video)) return;
      const requestedMediaTime = lastRequestedMediaTime[which];
      try {
        applySegment(which, await segmentVideoFrame(video, which), requestedMediaTime);
      } catch {
        applySegment(which, null, requestedMediaTime);
      }
    });

    type PumpHandle = {
      stop: () => void;
      rearm: (reason?: string) => void;
      state: VideoFramePumpState | null;
      trackSid: string | null;
      video: HTMLVideoElement | null;
    };
    const pumps: Record<SameSpaceSourceId, PumpHandle> = {
      local: { stop: () => undefined, rearm: () => undefined, state: null, trackSid: null, video: null },
      remote: { stop: () => undefined, rearm: () => undefined, state: null, trackSid: null, video: null },
    };

    const startPump = (which: SameSpaceSourceId, video: HTMLVideoElement, trackSid: string | null, reason: string) => {
      const instanceId = ensureVideoInstanceId(video);
      bumpDebug(which, (row) => {
        row.videoInstanceId = instanceId;
        row.lastRestartReason = reason;
        row.cleanupReason = '-';
      });
      const pump = startVideoFramePump(which, video, {
        onRvfcRegistered: () => bumpDebug(which, (row) => { row.rvfcRegistered += 1; }),
        onRvfcFired: () => bumpDebug(which, (row) => { row.rvfcFired += 1; }),
        onRafFired: () => bumpDebug(which, (row) => { row.rafFired += 1; }),
        onRafFallbackEngaged: () => bumpDebug(which, (row) => {
          row.rafFallbackEngaged += 1;
          row.watchdogRecoveryCount += 1;
        }),
        onModeChange: (mode) => bumpDebug(which, (row) => { row.pumpMode = mode; }),
        onFrame: ({ mediaTime }) => {
          if (which === 'remote' && !isRemoteLive()) return;
          lastRequestedMediaTime[which] = mediaTime;
          bumpDebug(which, (row) => {
            row.pendingMarks += 1;
            row.lastRequestedMediaTime = mediaTime;
            row.lastCallbackAgeMs = 0;
          });
          frameScheduler.request(which);
        },
      }, { trackSid });
      pumps[which] = {
        stop: () => {
          bumpDebug(which, (row) => { row.cleanupReason = 'stop'; });
          pump.stop();
        },
        rearm: pump.rearm,
        state: pump.state,
        trackSid,
        video,
      };
      pumpStateRef.current[which] = pump.state;
      bumpDebug(which, (row) => {
        row.pumpGeneration = pump.state.generation;
        row.pumpMode = pump.state.mode;
      });
    };

    /**
     * Idempotent start for local/remote. Safe to call from ref, attach,
     * media events, watchdog, and every render tick. Never remounts the
     * whole stage — only creates/reuses the matching source pump.
     */
    const maybeStartSourcePipeline = (which: SameSpaceSourceId, reason: string) => {
      if (disposed) return;
      const video = which === 'local' ? localRef.current : remoteVideoElRef.current;
      const attachment = which === 'remote' ? getAttachmentRef.current() : null;
      const mediaTrack = which === 'local'
        ? room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack
        : attachment?.track?.mediaStreamTrack;
      const trackSid = which === 'local'
        ? (room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.sid ?? null)
        : (attachment?.trackSid ?? null);
      const attachedToElement = which === 'local'
        ? Boolean(video?.srcObject)
        : Boolean(attachment?.attached || isRemoteVideoSourceLive(video));

      const readiness = evaluateSourcePipelineReadiness({
        video,
        mediaTrackReadyState: mediaTrack?.readyState ?? null,
        attachedToElement,
        expectedTrackSid: trackSid,
        pumpTrackSid: pumps[which].trackSid,
        requireLiveTrack: which === 'remote',
      });
      const sidRebind = shouldRebindForTrackSidChange({
        expectedTrackSid: trackSid,
        pumpTrackSid: pumps[which].trackSid,
      });
      bumpDebug(which, (row) => {
        row.readinessReason = sidRebind ? 'sid-mismatch' : readiness.reason;
        row.refReady = Boolean(video);
        row.attached = attachedToElement;
      });

      if (!readiness.ready || !video) return;

      if (
        !sidRebind
        && shouldReuseSourcePump({
          running: Boolean(pumps[which].state && !pumps[which].state!.cancelled),
          cancelled: Boolean(pumps[which].state?.cancelled),
          video,
          pumpVideo: pumps[which].video,
          trackSid,
          pumpTrackSid: pumps[which].trackSid,
        })
      ) {
        return;
      }

      if (sidRebind) {
        console.info('[same-space][rebind]', {
          source: which,
          reason,
          previousSid: pumps[which].trackSid,
          nextSid: trackSid,
        });
      }

      pumps[which].stop();
      startPump(which, video, trackSid, sidRebind ? `sid-rebind:${reason}` : reason);
    };

    remoteAttachNotifyRef.current = () => maybeStartSourcePipeline('remote', 'track-attached');
    maybeStartSourcePipeline('local', 'pipeline-mount');
    maybeStartSourcePipeline('remote', 'pipeline-mount');

    const snapshotDebug = (which: SameSpaceSourceId): SameSpaceSourceDebugSnapshot => {
      const video = which === 'local' ? localRef.current : remoteVideoElRef.current;
      const output = which === 'local' ? localSegmentedCanvas.current : remoteSegmentedCanvas.current;
      const track = readTrackDebug(room, which, compositionRef.current.partnerId);
      const row = debugRef.current[which];
      const pump = pumpStateRef.current[which];
      const now = performance.now();
      const hasCommittedForeground = Boolean(output && output.revision > 0);
      const videoReady = Boolean(video && isVideoFrameUsable(video));
      const hasExpectation = which === 'local'
        || compositionRef.current.hasRemoteTrack
        || isRemoteVideoSourceLive(video)
        || getAttachmentRef.current().attached;
      const reconnecting = Boolean(
        hasCommittedForeground
        && output
        && isForegroundReconnecting(output.lastValidAtMs, now),
      );
      const runtime = (() => {
        const slot = slotForSource(which);
        if (slot === 'left') return leftRuntime.current;
        if (slot === 'right') return rightRuntime.current;
        return emptyRuntime();
      })();
      const status = resolveForegroundStatus({
        hasTrackOrExpectation: hasExpectation,
        videoReady,
        hasCommittedForeground,
        reconnecting,
        consecutiveFailures: runtime.consecutiveFailures,
      });
      const placeholderReason = resolveForegroundPlaceholderReason({
        status,
        hasTrackOrExpectation: hasExpectation,
        videoReady,
        hasCommittedForeground,
        canvasPresent: Boolean(output?.canvas),
        generationMatch: Boolean(output && output.generation === outputGenerationLiveRef.current),
      });
      return {
        ...row,
        ...track,
        videoInstanceId: video ? ensureVideoInstanceId(video) : row.videoInstanceId,
        readyState: video?.readyState ?? 0,
        paused: video?.paused ?? true,
        ended: video?.ended ?? false,
        currentTime: video?.currentTime ?? 0,
        videoWidth: video?.videoWidth ?? 0,
        videoHeight: video?.videoHeight ?? 0,
        refReady: Boolean(video),
        attached: which === 'remote' ? getAttachmentRef.current().attached : Boolean(video?.srcObject),
        pumpMode: pump?.mode ?? row.pumpMode,
        pumpGeneration: pump?.generation ?? row.pumpGeneration,
        watchdogRecoveryCount: pump?.watchdogRecoveryCount ?? row.watchdogRecoveryCount,
        revision: output?.revision ?? row.revision,
        commitVersion: output?.revision ?? row.commitVersion ?? row.revision,
        contentRevision: output?.contentRevision ?? row.contentRevision ?? 0,
        lastDrawnVersion: which === 'local'
          ? compositorDrawRef.current.localDrawnVersion
          : compositorDrawRef.current.remoteDrawnVersion,
        captureVersion: lastCaptureVersionRef.current
          ? (which === 'local'
            ? lastCaptureVersionRef.current.localDrawn
            : lastCaptureVersionRef.current.remoteDrawn)
          : 0,
        compositeGeneration: compositorDrawRef.current.compositeGeneration,
        lastCompositorFrameMs: compositorDrawRef.current.lastFrameTimeMs,
        commitAgeMs: output && output.lastValidAtMs > 0
          ? Math.max(0, now - output.lastValidAtMs)
          : 0,
        drawAgeMs: compositorDrawRef.current.lastFrameTimeMs > 0
          ? Math.max(0, now - compositorDrawRef.current.lastFrameTimeMs)
          : 0,
        pixelWriteAgeMs: output && output.lastPixelWriteAtMs > 0
          ? Math.max(0, now - output.lastPixelWriteAtMs)
          : 0,
        lastCallbackAgeMs: pump && pump.lastFrameReceivedAt > 0
          ? Math.max(0, now - pump.lastFrameReceivedAt)
          : row.lastCallbackAgeMs,
        foregroundAgeMs: output && output.lastValidAtMs > 0
          ? Math.max(0, now - output.lastValidAtMs)
          : 0,
        status,
        placeholderReason,
        canvasWidth: output?.canvas.width ?? 0,
        canvasHeight: output?.canvas.height ?? 0,
        stageMount: mountGeneration.current,
        readinessReason: placeholderReason === 'NONE' ? status : placeholderReason,
      };
    };

    let lastRemoteRearmMs = 0;
    const buildLayer = (
      slot: SameSpaceCompositionSlot,
      isLocal: boolean,
      runtime: PersonRuntime,
      output: SegmentedSourceOutput | null,
      video: HTMLVideoElement | null,
    ) => {
      const now = performance.now();
      const hasCommittedForeground = Boolean(output && output.revision > 0);
      const foregroundFresh = Boolean(
        hasCommittedForeground && output && !isForegroundStale(output.lastValidAtMs, now),
      );
      const reconnecting = Boolean(
        hasCommittedForeground
        && output
        && isForegroundReconnecting(output.lastValidAtMs, now),
      );
      const rawUsable = Boolean(video && isVideoFrameUsable(video));
      const hasRemoteExpectation = isLocal || isRemoteLive();
      const status = resolveForegroundStatus({
        hasTrackOrExpectation: hasRemoteExpectation,
        videoReady: rawUsable,
        hasCommittedForeground,
        reconnecting,
        consecutiveFailures: runtime.consecutiveFailures,
      });
      const display = resolveSameSpaceLayerDisplay({
        hasCommittedForeground,
        foregroundFresh,
        reconnecting,
        rawUsable,
        allowDebugRawVideo,
        hasRemoteExpectation,
        status,
      });
      if (!isLocal && hasCommittedForeground && !foregroundFresh && now - lastRemoteRearmMs > 750) {
        lastRemoteRearmMs = now;
        maybeStartSourcePipeline('remote', 'stale-watchdog');
        pumps.remote.rearm('stale-watchdog');
        if (video && video.paused) void video.play().catch(() => undefined);
      }
      const preferRaw = display.preferRawVideo && allowDebugRawVideo;
      const mirrorDisplay = isLocal
        ? compositionRef.current.localVisual.mirrorX
        : compositionRef.current.remoteVisual.mirrorX;
      const transform = compositionRef.current.personTransforms?.[slot];
      const userId = slot === 'left'
        ? compositionRef.current.leftUserId
        : compositionRef.current.rightUserId;
      const persistedManual = compositionRef.current.participantTransforms[userId]
        ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET;
      const manualOffset = isLocal && liveManualOffsetRef.current
        ? liveManualOffsetRef.current
        : persistedManual;
      // Assist only — home + transform + manual applied once inside placement.
      const motionOffsetX = runtime.motionOffsetX;
      // Soft silhouette only while warming — never after the first commit.
      const showLoadingSilhouette = display.showLoadingSilhouette
        && shouldShowWarmupPlaceholder(status)
        && hasRemoteExpectation;
      const fitPersonHeightNorm = resolveFitPersonHeightNorm(runtime.fitScale, runtime.bounds);
      const fitLocked = runtime.fitScale.lockedHeightNorm != null;
      return {
        slot,
        output: resolveActiveForegroundOutput(
          hasCommittedForeground ? output : null,
          outputGenerationLiveRef.current,
        ),
        bounds: runtime.bounds,
        sourceWidth: runtime.sourceWidth || video?.videoWidth || 0,
        sourceHeight: runtime.sourceHeight || video?.videoHeight || 0,
        fitPersonHeightNorm,
        disableEdgeScaleDamp: fitLocked,
        transform,
        manualOffset,
        mirrorDisplay,
        motionOffsetX,
        rawVideo: preferRaw ? video : null,
        preferRawVideo: preferRaw,
        allowDebugRawVideo,
        showLoadingSilhouette,
        showReconnecting: display.showReconnecting,
      };
    };

    const render = (now: number) => {
      if (disposed) return;
      raf = window.requestAnimationFrame(render);
      maybeStartSourcePipeline('local', 'render-tick');
      maybeStartSourcePipeline('remote', 'render-tick');
      if (now - lastRenderMs < 1000 / RENDER_FPS) return;
      lastRenderMs = now;
      const ctx = canvasCtxRef.current;
      if (!ctx || canvas.width <= 0 || canvas.height <= 0) return;

      const slot = compositionRef.current.localSlot;
      if (!slot) return;
      const localVideo = localRef.current;
      const remoteLive = isRemoteLive();
      const remoteVideo = remoteVideoElRef.current;
      const leftIsLocal = slot === 'left';
      const rightIsLocal = slot === 'right';
      // Always read the stable source-owned canvases — never drop a committed
      // remote FG just because the <video> briefly reports not-live.
      const leftOutput = leftIsLocal ? localSegmentedCanvas.current : remoteSegmentedCanvas.current;
      const rightOutput = rightIsLocal ? localSegmentedCanvas.current : remoteSegmentedCanvas.current;
      const leftVideo = leftIsLocal ? localVideo : (remoteLive ? remoteVideo : null);
      const rightVideo = rightIsLocal ? localVideo : (remoteLive ? remoteVideo : null);

      const leftLayer = {
        ...buildLayer('left', leftIsLocal, leftRuntime.current, leftOutput, leftVideo),
        lighting: liveLightingRef.current.participantA,
      };
      const rightLayer = {
        ...buildLayer('right', rightIsLocal, rightRuntime.current, rightOutput, rightVideo),
        lighting: liveLightingRef.current.participantB,
      };

      renderSameSpaceCompositionFrame({
        ctx,
        width: canvas.width,
        height: canvas.height,
        background: compositionRef.current.background,
        backgroundImage: compositionRef.current.background.type === 'image' && compositionRef.current.backgroundImage
          ? {
              presetId: compositionRef.current.background.presetId,
              url: compositionRef.current.background.url ?? '',
              image: compositionRef.current.backgroundImage,
            }
          : null,
        foregroundImage: compositionRef.current.foregroundImage,
        sharedSceneId: compositionRef.current.sharedSceneId,
        frontSlot: compositionRef.current.frontSlot,
        soloLayout: compositionRef.current.soloLayout,
        spanMode: compositionRef.current.sceneSpanMode,
        showWaitingHint: !remoteLive,
        left: leftLayer,
        right: rightLayer,
        companions: compositionRef.current.companions,
      });

      // Track local placement for drag hit-testing + edge UX.
      const localLayer = localSlot === 'left' ? leftLayer : rightLayer;
      if (localSlot && localLayer.sourceWidth > 0 && localLayer.sourceHeight > 0) {
        const placement = computeSameSpacePersonPlacement({
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          sourceWidth: localLayer.sourceWidth,
          sourceHeight: localLayer.sourceHeight,
          personBounds: localLayer.bounds,
          fitPersonHeightNorm: localLayer.fitPersonHeightNorm,
          disableEdgeScaleDamp: localLayer.disableEdgeScaleDamp,
          normalizedTransform: localLayer.transform,
          manualOffset: localLayer.manualOffset,
          slot: localSlot,
          soloLayout: compositionRef.current.soloLayout,
          participantCount: (leftOutput?.revision ?? 0) > 0 && (rightOutput?.revision ?? 0) > 0 ? 2 : 1,
          motionOffsetX: localLayer.motionOffsetX ?? 0,
          spanMode: compositionRef.current.sceneSpanMode,
        });
        localPlacementRef.current = {
          dest: placement.dest,
          personDest: placement.personDest,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        };
        const touch = placement.edgeTouch;
        const hugging = touch.left || touch.right || touch.top || touch.bottom;
        cameraEdgeHintRef.current = hugging;

        if (debugEnabled) {
          const sw = localLayer.sourceWidth;
          const sh = localLayer.sourceHeight;
          const b = localLayer.bounds;
          const fgW = localLayer.output?.canvas.width ?? 0;
          const fgH = localLayer.output?.canvas.height ?? 0;
          // Debug rects: dest sprite, alpha person footprint, stage outer.
          ctx.save();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(80,200,255,0.85)';
          ctx.strokeRect(placement.dest.x, placement.dest.y, placement.dest.width, placement.dest.height);
          ctx.strokeStyle = 'rgba(255,210,80,0.9)';
          ctx.strokeRect(
            placement.personDest.x,
            placement.personDest.y,
            placement.personDest.width,
            placement.personDest.height,
          );
          ctx.strokeStyle = 'rgba(255,80,120,0.7)';
          ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
          ctx.restore();
          layoutDebugRef.current = [
            `slot=${localSlot} clip=${placement.clipBoundary}`,
            `src=${sw}x${sh} fgCanvas=${fgW}x${fgH}`,
            b
              ? `bbox L${b.minX.toFixed(2)} R${b.maxX.toFixed(2)} T${b.minY.toFixed(2)} B${b.maxY.toFixed(2)}`
              : 'bbox=-',
            `edgeTouch L${touch.left ? 1 : 0} R${touch.right ? 1 : 0} T${touch.top ? 1 : 0} B${touch.bottom ? 1 : 0}`,
            `assistX=${(localLayer.motionOffsetX ?? 0).toFixed(3)} manualX=${(localLayer.manualOffset?.offsetX ?? 0).toFixed(3)}`,
            `centerX=${(placement.anchor.x / canvas.width).toFixed(3)} scale=${placement.scale.toFixed(3)}`,
            'sourceCrop=full-frame (no bbox crop)',
          ].join('\n');
        }
      }

      compositorDrawRef.current = advanceCompositorDrawState(
        compositorDrawRef.current,
        localSegmentedCanvas.current?.revision ?? 0,
        remoteSegmentedCanvas.current?.revision ?? 0,
        now,
      );

      const localCommitted = (localSegmentedCanvas.current?.revision ?? 0) > 0;
      const remoteExpected = isRemoteLive();
      const remoteCommitted = (remoteSegmentedCanvas.current?.revision ?? 0) > 0;
      warmUpHintRef.current = modelReady
        && (!localCommitted || (remoteExpected && !remoteCommitted));
    };

    raf = window.requestAnimationFrame(render);

    let heartbeatPrevCurrent = { local: Number.NaN as number, remote: Number.NaN as number };
    let lastSegmenterRecreateMs = 0;
    let soakTick = 0;
    const heartbeat = window.setInterval(() => {
      if (disposed) return;
      const now = performance.now();
      soakCountersRef.current.heartbeatTick += 1;
      // Shared segmenter busy lock stuck → recreate without remounting stage.
      if (getLiveSegmenterBusyAgeMs() >= 1500 && now - lastSegmenterRecreateMs > 2000) {
        lastSegmenterRecreateMs = now;
        void recreateLiveSegmenterIfStuck().then((recreated) => {
          if (!recreated || disposed) return;
          maybeStartSourcePipeline('local', 'segmenter-recreate');
          maybeStartSourcePipeline('remote', 'segmenter-recreate');
          pumps.local.rearm('segmenter-recreate');
          pumps.remote.rearm('segmenter-recreate');
        });
      }
      for (const which of ['local', 'remote'] as const) {
        const video = which === 'local' ? localRef.current : remoteVideoElRef.current;
        const output = which === 'local' ? localSegmentedCanvas.current : remoteSegmentedCanvas.current;
        const attachment = which === 'remote' ? getAttachmentRef.current() : null;
        const mediaTrack = which === 'local'
          ? room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack
          : attachment?.track?.mediaStreamTrack;
        const action = decideSourceRecovery({
          sourceId: which,
          videoCurrentTime: video?.currentTime ?? 0,
          previousCurrentTime: heartbeatPrevCurrent[which],
          lastEnqueueAtMs: pumpStateRef.current[which]?.lastFrameReceivedAt ?? 0,
          lastSegmentSuccessAtMs: debugRef.current[which].lastCommittedAtMs,
          lastCommitAtMs: output?.lastPixelWriteAtMs ?? output?.lastValidAtMs ?? 0,
          lastDrawnAtMs: compositorDrawRef.current.lastFrameTimeMs,
          commitVersion: output?.revision ?? 0,
          drawnVersion: which === 'local'
            ? compositorDrawRef.current.localDrawnVersion
            : compositorDrawRef.current.remoteDrawnVersion,
          contentRevision: output?.contentRevision ?? 0,
          trackReadyState: mediaTrack?.readyState ?? '-',
          attached: which === 'local'
            ? Boolean(video?.srcObject)
            : Boolean(attachment?.attached || isRemoteVideoSourceLive(video)),
          nowMs: now,
        });
        heartbeatPrevCurrent[which] = video?.currentTime ?? heartbeatPrevCurrent[which];
        if (action.type === 'none') continue;
        // Never let remote recovery restart the local source controller.
        if (which === 'local' && action.type !== 'rearm-and-enqueue' && action.type !== 'recover-commit') {
          continue;
        }
        if (action.type === 'rearm-and-enqueue' || action.type === 'recover-track-attach') {
          soakCountersRef.current.forcedEnqueue[which] += 1;
          soakCountersRef.current.restartCount[which] += 1;
          maybeStartSourcePipeline(which, `heartbeat:${action.reason}`);
          pumps[which].rearm(`heartbeat:${action.reason}`);
          if (video && video.paused) void video.play().catch(() => undefined);
          if (video && isVideoFrameUsable(video)) {
            lastRequestedMediaTime[which] = video.currentTime;
            frameScheduler.request(which);
          }
        } else if (action.type === 'recover-scheduler') {
          soakCountersRef.current.forcedEnqueue[which] += 1;
          frameScheduler.request(which);
        } else if (action.type === 'recover-commit') {
          // Force a fresh enqueue so the next successful segment writes pixels.
          soakCountersRef.current.forcedEnqueue[which] += 1;
          pumps[which].rearm(`heartbeat:${action.reason}`);
          if (video && isVideoFrameUsable(video)) {
            lastRequestedMediaTime[which] = video.currentTime;
            frameScheduler.request(which);
          }
        } else if (action.type === 'recover-compositor') {
          lastRenderMs = 0;
        }
      }

      // DEV soak counters (~1Hz) for long-run remote freeze diagnosis.
      soakTick += 1;
      if (import.meta.env.DEV && soakTick % Math.max(1, Math.round(1000 / SOURCE_HEARTBEAT_MS)) === 0) {
        const tSec = Math.round(soakTick * SOURCE_HEARTBEAT_MS / 1000);
        for (const which of ['local', 'remote'] as const) {
          const video = which === 'local' ? localRef.current : remoteVideoElRef.current;
          const output = which === 'local' ? localSegmentedCanvas.current : remoteSegmentedCanvas.current;
          const dbg = debugRef.current[which];
          const track = readTrackDebug(room, which, partnerId);
          const enqueue = dbg.pendingMarks + dbg.submitted;
          const drawn = which === 'local'
            ? compositorDrawRef.current.localDrawnVersion
            : compositorDrawRef.current.remoteDrawnVersion;
          const prev = soakCountersRef.current.prev[which];
          const videoCurrentTime = video?.currentTime ?? 0;
          const commit = output?.revision ?? 0;
          const contentRevision = output?.contentRevision ?? 0;
          const progress = describeCounterProgress({
            videoCurrentTime,
            enqueue,
            segmentOk: dbg.inferenceSuccess,
            commit,
            drawn,
            contentRevision,
            prev,
          });
          const stallClass = classifyRemoteStall({
            side: which,
            videoCurrentTimeDelta: prev ? videoCurrentTime - prev.videoCurrentTime : 0,
            enqueueDelta: prev ? enqueue - prev.enqueue : 0,
            segmentOkDelta: prev ? dbg.inferenceSuccess - prev.segmentOk : 0,
            commitDelta: prev ? commit - prev.commit : 0,
            drawnDelta: prev ? drawn - prev.drawn : 0,
            contentRevisionDelta: prev ? contentRevision - prev.contentRevision : 0,
            ages: {
              enqueueAgeMs: pumpStateRef.current[which]?.lastFrameReceivedAt
                ? now - pumpStateRef.current[which]!.lastFrameReceivedAt
                : Number.POSITIVE_INFINITY,
              segmentAgeMs: dbg.lastCommittedAtMs ? now - dbg.lastCommittedAtMs : Number.POSITIVE_INFINITY,
              commitAgeMs: output?.lastPixelWriteAtMs ? now - output.lastPixelWriteAtMs : Number.POSITIVE_INFINITY,
              drawAgeMs: compositorDrawRef.current.lastFrameTimeMs
                ? now - compositorDrawRef.current.lastFrameTimeMs
                : Number.POSITIVE_INFINITY,
              contentAgeMs: output?.lastPixelWriteAtMs ? now - output.lastPixelWriteAtMs : Number.POSITIVE_INFINITY,
            },
          });
          const sample: SourceSoakSample = {
            tSec,
            side: which,
            identityShort: track.identityShort,
            publicationSidShort: track.publicationSidShort,
            trackSidShort: track.trackSidShort,
            trackReadyState: track.mediaTrackReadyState,
            muted: track.mediaTrackMuted,
            videoCurrentTime,
            videoReadyState: video?.readyState ?? 0,
            paused: Boolean(video?.paused),
            videoWidth: video?.videoWidth ?? 0,
            videoHeight: video?.videoHeight ?? 0,
            pumpMode: dbg.pumpMode,
            rvfcFired: dbg.rvfcFired,
            rafFired: dbg.rafFired,
            rafFallbackEngaged: dbg.rafFallbackEngaged,
            heartbeatTick: soakCountersRef.current.heartbeatTick,
            forcedEnqueue: soakCountersRef.current.forcedEnqueue[which],
            schedulerEnqueue: dbg.submitted,
            segmentStart: dbg.submitted,
            segmentOk: dbg.inferenceSuccess,
            segmentErr: dbg.inferenceFailure,
            contentRevision,
            commitVersion: commit,
            drawnVersion: drawn,
            commitAgeMs: output?.lastValidAtMs ? Math.max(0, now - output.lastValidAtMs) : -1,
            drawAgeMs: compositorDrawRef.current.lastFrameTimeMs
              ? Math.max(0, now - compositorDrawRef.current.lastFrameTimeMs)
              : -1,
            busyAgeMs: getLiveSegmenterBusyAgeMs(),
            pumpGeneration: dbg.pumpGeneration,
            attachCount: soakCountersRef.current.attachCount[which],
            detachCount: soakCountersRef.current.detachCount[which],
            restartCount: soakCountersRef.current.restartCount[which],
            lastRestartReason: dbg.lastRestartReason,
            roomConnectCount: soakCountersRef.current.roomConnectCount,
            roomDisconnectCount: soakCountersRef.current.roomDisconnectCount,
            fingerprintChanged: Boolean(prev && contentRevision > prev.contentRevision),
            stallClass,
            lastIncreasedCounter: progress.lastIncreasedCounter,
            firstStalledCounter: progress.firstStalledCounter,
          };
          soakRingRef.current.push(sample);
          soakCountersRef.current.prev[which] = {
            videoCurrentTime,
            enqueue,
            segmentOk: dbg.inferenceSuccess,
            commit,
            drawn,
            contentRevision,
          };
          if (which === 'remote') {
            if (stallClass !== 'HEALTHY') setSoakStallHint(stallClass);
            console.info('[couple-booth][remote-soak]', {
              tSec: sample.tSec,
              stallClass: sample.stallClass,
              lastIncreased: sample.lastIncreasedCounter,
              firstStalled: sample.firstStalledCounter,
              videoCurrentTime: sample.videoCurrentTime,
              readyState: sample.videoReadyState,
              pumpMode: sample.pumpMode,
              rvfc: sample.rvfcFired,
              raf: sample.rafFired,
              enqueue: sample.schedulerEnqueue,
              segmentOk: sample.segmentOk,
              commitVersion: sample.commitVersion,
              contentRevision: sample.contentRevision,
              drawnVersion: sample.drawnVersion,
              fingerprintChanged: sample.fingerprintChanged,
              commitAgeMs: sample.commitAgeMs,
              busyAgeMs: sample.busyAgeMs,
              trackSid: sample.trackSidShort,
              forcedEnqueue: sample.forcedEnqueue,
            });
          }
        }
      }
    }, SOURCE_HEARTBEAT_MS);

    if (debugEnabled) {

      const tickHud = () => {
        if (disposed) return;
        setDebugHud({
          local: snapshotDebug('local'),
          remote: snapshotDebug('remote'),
        });
        setLayoutDebug(layoutDebugRef.current || null);
        setCameraEdgeHint(cameraEdgeHintRef.current);
        setWarmUpHint(warmUpHintRef.current);
        hudRaf = window.setTimeout(tickHud, 250) as unknown as number;
      };
      tickHud();
    } else {
      const tickEdge = () => {
        if (disposed) return;
        setCameraEdgeHint(cameraEdgeHintRef.current);
        setWarmUpHint(warmUpHintRef.current);
        hudRaf = window.setTimeout(tickEdge, 400) as unknown as number;
      };
      tickEdge();
    }

    return () => {
      disposed = true;
      remoteAttachNotifyRef.current = null;
      window.cancelAnimationFrame(raf);
      window.clearInterval(heartbeat);
      if (hudRaf) window.clearTimeout(hudRaf);
      frameScheduler.dispose();
      pumps.local.stop();
      pumps.remote.stop();
      pumpStateRef.current = { local: null, remote: null };
      resizeObserver.disconnect();
      canvasCtxRef.current = null;
      localSegmentedCanvas.current = null;
      remoteSegmentedCanvas.current = null;
    };
  }, [
    // Intentionally omit hasRemoteTrack / partnerId / background / frontSlot /
    // mirrors — those are compositionRef fields. Remounting when the guest
    // track arrived was freezing host-side remote motion.
    allowDebugRawVideo,
    debugEnabled,
    localSlot,
    modelReady,
    room,
    trackEpoch,
  ]);

  useEffect(() => {
    if (!captureHandleRef) return;
    const handle: SameSpaceLiveCaptureHandle = {
      getDebugVersions: () => ({
        localCommitVersion: localSegmentedCanvas.current?.revision ?? 0,
        remoteCommitVersion: remoteSegmentedCanvas.current?.revision ?? 0,
        localDrawnVersion: compositorDrawRef.current.localDrawnVersion,
        remoteDrawnVersion: compositorDrawRef.current.remoteDrawnVersion,
        compositeGeneration: compositorDrawRef.current.compositeGeneration,
        lastCompositorFrameMs: compositorDrawRef.current.lastFrameTimeMs,
        captureVersion: lastCaptureVersionRef.current,
      }),
      captureWysiwyg: async (captureOptions) => {
        const canvas = canvasRef.current;
        if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
          throw new Error('SAME_SPACE_COMPOSITE_MISSING');
        }
        const minimumPresentationGeneration = captureOptions?.companions
          ? compositorDrawRef.current.compositeGeneration + 1
          : undefined;
        if (captureOptions?.companions) {
          compositionRef.current.companions = captureOptions.companions;
        }
        const result = await snapshotAuthoritativeComposite({
          compositeCanvas: canvas,
          getDrawState: () => compositorDrawRef.current,
          getCommitVersions: () => ({
            localCommitVersion: localSegmentedCanvas.current?.revision ?? 0,
            remoteCommitVersion: remoteSegmentedCanvas.current?.revision ?? 0,
          }),
          getLocalForeground: () => {
            const output = resolveActiveForegroundOutput(
              localSegmentedCanvas.current,
              outputGenerationLiveRef.current,
            );
            if (!output) return null;
            return { canvas: output.canvas, revision: output.revision };
          },
          getLocalVideo: () => localRef.current,
          requireRemote: Boolean(
            compositionRef.current.hasRemoteTrack
            || isRemoteVideoSourceLive(remoteVideoElRef.current)
            || getAttachmentRef.current().attached,
          ) && (remoteSegmentedCanvas.current?.revision ?? 0) > 0,
          mirrorX: compositionRef.current.localVisual.mirrorX,
          captureViewportMode,
          minCompositeGeneration: minimumPresentationGeneration,
        });
        lastCaptureVersionRef.current = result.captureVersion;
        return result;
      },
    };
    captureHandleRef.current = handle;
    return () => {
      if (captureHandleRef.current === handle) captureHandleRef.current = null;
    };
  }, [captureHandleRef]);

  const retryModel = () => {
    disposeLiveSegmenter();
    leftRuntime.current = emptyRuntime();
    rightRuntime.current = emptyRuntime();
    setModelError(false);
    setModelReady(false);
    setRetryToken((value) => value + 1);
  };

  const statusMessage = !modelReady && !modelError
    ? '배경 효과를 준비하는 중…'
    : warmUpHint
      ? '카메라 준비 중…'
      : null;

  const onLocalTransformPreviewRef = useRef(onLocalTransformPreview);
  onLocalTransformPreviewRef.current = onLocalTransformPreview;
  const onLocalTransformCommitRef = useRef(onLocalTransformCommit);
  onLocalTransformCommitRef.current = onLocalTransformCommit;

  const clientToCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const placement = localPlacementRef.current;
    if (!canvas || !placement) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * placement.canvasWidth,
      y: ((clientY - rect.top) / rect.height) * placement.canvasHeight,
    };
  };

  const emitLivePreview = (next: SameSpaceManualOffset, force = false) => {
    liveManualOffsetRef.current = next;
    const now = performance.now();
    if (!force && now - previewThrottleRef.current < 40) return;
    previewThrottleRef.current = now;
    onLocalTransformPreviewRef.current?.(next);
  };

  const hitResizeCorner = (
    canvasX: number,
    canvasY: number,
    person: { x: number; y: number; width: number; height: number },
  ): boolean => {
    const corners = [
      { x: person.x, y: person.y },
      { x: person.x + person.width, y: person.y },
      { x: person.x, y: person.y + person.height },
      { x: person.x + person.width, y: person.y + person.height },
    ];
    const radius = Math.max(28, Math.min(person.width, person.height) * 0.12);
    return corners.some((c) => Math.hypot(canvasX - c.x, canvasY - c.y) <= radius);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!localSlot || !onLocalTransformCommitRef.current) return;
    const pt = clientToCanvas(event.clientX, event.clientY);
    const placement = localPlacementRef.current;
    if (!pt || !placement) return;

    const existing = dragRef.current;
    if (existing && (existing.mode === 'move' || existing.mode === 'resize') && existing.pointerId !== event.pointerId) {
      const pointers = new Map<number, { x: number; y: number }>();
      if (existing.mode === 'move') {
        pointers.set(existing.pointerId, { x: existing.startClientX, y: existing.startClientY });
      } else {
        pointers.set(existing.pointerId, { x: event.clientX, y: event.clientY });
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const [a, b] = [...pointers.values()];
      dragRef.current = {
        mode: 'pinch',
        startOffset: existing.startOffset,
        startDist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)),
        pointers,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    const hit = placement.personDest;
    const pad = Math.max(24, hit.width * 0.08);
    const inside = !(
      pt.x < hit.x - pad
      || pt.x > hit.x + hit.width + pad
      || pt.y < hit.y - pad
      || pt.y > hit.y + hit.height + pad
    );
    if (!inside) return;

    const userId = localUserId;
    const startOffset = clampManualOffset({
      ...(liveManualOffsetRef.current
        ?? participantTransforms?.[userId]
        ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET),
      mode: 'manual',
    });
    const resizing = hitResizeCorner(pt.x, pt.y, hit);
    if (resizing) {
      const centerX = hit.x + hit.width / 2;
      const centerY = hit.y + hit.height / 2;
      dragRef.current = {
        mode: 'resize',
        pointerId: event.pointerId,
        startOffset,
        startDist: Math.max(1, Math.hypot(pt.x - centerX, pt.y - centerY)),
        centerX,
        centerY,
      };
    } else {
      dragRef.current = {
        mode: 'move',
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startOffset,
      };
    }
    liveManualOffsetRef.current = startOffset;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const placement = localPlacementRef.current;
    const canvas = canvasRef.current;
    if (!placement || !canvas || placement.canvasWidth <= 0) return;
    const rect = canvas.getBoundingClientRect();

    if (drag.mode === 'pinch') {
      drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (drag.pointers.size < 2) return;
      const pts = [...drag.pointers.values()];
      const dist = Math.max(1, Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y));
      const next = clampManualOffset({
        ...drag.startOffset,
        scale: drag.startOffset.scale * (dist / drag.startDist),
        mode: 'manual',
      });
      emitLivePreview(next);
      event.preventDefault();
      return;
    }

    if (drag.pointerId !== event.pointerId) return;

    if (drag.mode === 'move') {
      const dxNorm = (event.clientX - drag.startClientX) / rect.width;
      const dyNorm = (event.clientY - drag.startClientY) / rect.height;
      const next = clampManualOffset({
        offsetX: drag.startOffset.offsetX + dxNorm,
        offsetY: drag.startOffset.offsetY + dyNorm,
        scale: drag.startOffset.scale,
        mode: 'manual',
      });
      emitLivePreview(next);
      event.preventDefault();
      return;
    }

    const pt = clientToCanvas(event.clientX, event.clientY);
    if (!pt) return;
    const dist = Math.max(1, Math.hypot(pt.x - drag.centerX, pt.y - drag.centerY));
    const next = clampManualOffset({
      ...drag.startOffset,
      scale: Math.min(
        SAME_SPACE_MANUAL_SCALE_CLAMP.scaleMax,
        Math.max(SAME_SPACE_MANUAL_SCALE_CLAMP.scaleMin, drag.startOffset.scale * (dist / drag.startDist)),
      ),
      mode: 'manual',
    });
    emitLivePreview(next);
    event.preventDefault();
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'pinch') {
      drag.pointers.delete(event.pointerId);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch { /* already released */ }
      if (drag.pointers.size === 0) {
        dragRef.current = null;
        const finalOffset = liveManualOffsetRef.current ?? drag.startOffset;
        emitLivePreview(finalOffset, true);
        onLocalTransformCommitRef.current?.(finalOffset);
      }
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const finalOffset = liveManualOffsetRef.current ?? drag.startOffset;
    emitLivePreview(finalOffset, true);
    onLocalTransformCommitRef.current?.(finalOffset);
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    if (!localSlot || !onLocalTransformCommitRef.current) return;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const current = clampManualOffset(
      liveManualOffsetRef.current
      ?? participantTransforms?.[localUserId]
      ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
    );
    const delta = -event.deltaY * 0.0015;
    const next = clampManualOffset({
      ...current,
      scale: current.scale * (1 + delta),
      mode: 'manual',
    });
    emitLivePreview(next, true);
    onLocalTransformCommitRef.current?.(next);
  };

  const onDoubleClick = () => {
    if (!onLocalTransformCommitRef.current) return;
    liveManualOffsetRef.current = DEFAULT_SAME_SPACE_MANUAL_OFFSET;
    emitLivePreview(DEFAULT_SAME_SPACE_MANUAL_OFFSET, true);
    onLocalTransformCommitRef.current(DEFAULT_SAME_SPACE_MANUAL_OFFSET);
  };

  return (
    <div
      ref={stageRef}
      className="same-space-live-stage"
      data-span={LIVE_CAPTURE_SCENE_SPAN_MODE}
      data-capture-viewport={captureViewportMode}
      aria-label="Same Space stage"
      data-remote-connected={remoteConnected ? 'true' : 'false'}
      data-remote-track={hasRemoteTrack ? 'true' : 'false'}
      data-model-ready={modelReady ? 'true' : 'false'}
      data-local-slot={localSlot ?? 'unknown'}
      style={{ aspectRatio: `${sceneSpecForSpanMode(LIVE_CAPTURE_SCENE_SPAN_MODE, captureViewportMode).width} / ${sceneSpecForSpanMode(LIVE_CAPTURE_SCENE_SPAN_MODE, captureViewportMode).height}` }}
    >
      <video
        ref={localRef}
        className="same-space-hidden-video"
        autoPlay
        muted
        playsInline
        data-same-space-source="local"
      />
      <video
        ref={setRemoteNode}
        className="same-space-hidden-video"
        autoPlay
        muted
        playsInline
        data-same-space-source="remote"
      />
      <canvas
        ref={canvasRef}
        className="same-space-live-canvas"
        style={{ touchAction: 'none', cursor: onLocalTransformCommit ? 'grab' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      />
      {poseGuide ? (
        <CouplePoseGuideOverlay
          poseId={poseGuide.poseId}
          localRole={poseGuide.localRole}
          localStageSide={poseGuide.localStageSide}
          partnerAvailable={remoteConnected && hasRemoteTrack}
          mode={poseGuide.mode}
        />
      ) : null}
      {cameraEdgeHint ? (
        <div className="same-space-stage-banner" role="status">
          카메라에서 조금만 멀어져 주세요
        </div>
      ) : null}
      {statusMessage ? (
        <div className={`same-space-live-waiting${warmUpHint && modelReady ? ' is-soft same-space-warmup-banner' : ''}`} role="status">
          {statusMessage}
        </div>
      ) : null}
      {modelError ? (
        <div className="same-space-live-waiting is-soft" role="status">
          <p style={{ margin: 0 }}>배경 효과만 준비되지 않았어요. 일반 화면으로 촬영을 계속할 수 있어요.</p>
          <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} onClick={retryModel}>
            배경 효과 다시 시도
          </button>
        </div>
      ) : null}
      {debugHud ? (
        <div className="same-space-debug-hud" aria-hidden>
          {(['local', 'remote'] as const).map((which) => {
            const row = debugHud[which];
            return (
              <pre key={which}>
                {`${which} ${row.videoInstanceId} sid:${row.trackSidShort} mt:${row.mediaTrackReadyState}\n`}
                {`ref:${row.refReady ? 'y' : 'n'} att:${row.attached ? 'y' : 'n'} mode:${row.pumpMode} gen:${row.pumpGeneration}\n`}
                {`ready:${row.readinessReason} restart:${row.lastRestartReason}\n`}
                {`t:${row.currentTime.toFixed(2)} rvfc:${row.rvfcFired}/${row.rvfcRegistered} enq:${row.pendingMarks} segOk:${row.inferenceSuccess}\n`}
                {`status:${row.status} ph:${row.placeholderReason} canvas:${row.canvasWidth}x${row.canvasHeight}\n`}
                {`commitV:${row.commitVersion ?? row.revision} contentV:${row.contentRevision ?? 0} drawnV:${row.lastDrawnVersion ?? 0} capV:${row.captureVersion ?? 0}\n`}
                {`compGen:${row.compositeGeneration ?? 0} commitAge:${Math.round(row.commitAgeMs ?? row.foregroundAgeMs)} drawAge:${Math.round(row.drawAgeMs ?? 0)} pxAge:${Math.round(row.pixelWriteAgeMs ?? 0)}\n`}
                {`frameMs:${Math.round(row.lastCompositorFrameMs ?? 0)} ${row.videoWidth}x${row.videoHeight} rs:${row.readyState} mount:${row.stageMount || mountGeneration.current}`}
              </pre>
            );
          })}
          {layoutDebug ? <pre>{layoutDebug}</pre> : null}
          {import.meta.env.DEV ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ pointerEvents: 'auto', fontSize: 11, padding: '4px 8px' }}
              onClick={() => {
                const text = soakRingRef.current.toClipboardText();
                void navigator.clipboard?.writeText(text).catch(() => undefined);
                console.info('[couple-booth][remote-soak][copy]', text.slice(0, 400));
              }}
            >
              Copy diagnostics{soakStallHint ? ` (${soakStallHint})` : ''}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
