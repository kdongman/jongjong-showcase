/** Shared couple-booth domain types used by mobile + web. */

import type { SameSpaceBackground } from './sameSpaceBackground';

export const COUPLE_BOOTH_FEATURE_VERSION = 1 as const;
export const COUPLE_BOOTH_PROTOCOL_VERSION = 1 as const;

/** Authoritative capture window once the host starts shooting (server sets media_expires_at). */
export const COUPLE_BOOTH_CAPTURE_DURATION_SECONDS = 90;
export const COUPLE_BOOTH_CAPTURE_DURATION_MS = COUPLE_BOOTH_CAPTURE_DURATION_SECONDS * 1000;

/** @deprecated Use COUPLE_BOOTH_CAPTURE_DURATION_SECONDS — kept as alias for existing imports. */
export const MEDIA_SESSION_SECONDS = COUPLE_BOOTH_CAPTURE_DURATION_SECONDS;

export const MEDIA_WARN_REMAINING_SECONDS = 20;
export const MEDIA_CRITICAL_REMAINING_SECONDS = 10;

/** Do not schedule a new capture if less than this remains on the server clock. */
export const MINIMUM_CAPTURE_WINDOW_MS = 4_500;

export const TOTAL_SHOTS = 8;
export const REQUIRED_SELECTED_SHOTS = 4;
/** Every shot uses a server-issued three-second countdown lead. */
export const CAPTURE_LEAD_MS = 3000;
export const BACKGROUND_GRACE_MS = 30_000;
export const INVITE_TTL_MS = 5 * 60_000;
export const SIGNED_URL_TTL_SECONDS = 3600;
export const VIDEO_IDEAL_WIDTH = 1280;
export const VIDEO_IDEAL_HEIGHT = 720;
export const VIDEO_IDEAL_FPS = 20;
export const VIDEO_MAX_FPS = 24;
/** Canonical print/export strip pixels. CSS preview sizes must never replace these. */
export const FINAL_OUTPUT_WIDTH = 1200;
export const FINAL_OUTPUT_HEIGHT = 3600;
export const FINAL_JPEG_QUALITY = 0.92;

export type BoothPlatform = 'ios' | 'android' | 'web';

export type BoothSessionStatus =
  | 'invited'
  | 'accepted'
  | 'connecting'
  | 'ready'
  | 'capturing'
  | 'review'
  | 'finalizing'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'failed';

export type BoothParticipantMeta = {
  platform: BoothPlatform;
  appVersion: string;
  featureVersion: typeof COUPLE_BOOTH_FEATURE_VERSION;
};

export type BoothPose = {
  index: number;
  id: string;
  promptKey: string;
};

export type CapturedFrame = {
  uri: string;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  capturedAt: number;
  mirrored: boolean;
  /** Whether the JPEG pixels already include the horizontal mirror transform. */
  mirrorBakedIntoAsset?: boolean;
  mirrorX?: boolean;
  cameraFacing?: 'user' | 'environment' | 'unknown';
};

export type BoothShotRow = {
  id: string;
  sessionId: string;
  userId: string;
  shotIndex: number;
  captureId: string;
  imagePath: string;
  capturedAt: string;
  width?: number | null;
  height?: number | null;
  mirrorX?: boolean;
  mirrorBakedIntoAsset?: boolean;
  cameraFacing?: 'user' | 'environment' | 'unknown';
  cutoutPath?: string | null;
  segmentationStatus?: 'not_requested' | 'processing' | 'ready' | 'failed';
};

export type BoothSession = {
  id: string;
  coupleId: string;
  hostUserId: string;
  guestUserId: string;
  status: BoothSessionStatus;
  livekitRoomName: string;
  currentShotIndex: number;
  selectedShotIndexes: number[];
  hostApproved: boolean;
  guestApproved: boolean;
  connectedAt?: string | null;
  bothReadyAt?: string | null;
  captureStartedAt?: string | null;
  mediaExpiresAt?: string | null;
  currentCaptureId?: string | null;
  currentCaptureAt?: string | null;
  sameSpaceEnabled?: boolean;
  captureViewportMode?: 'desktop' | 'mobile';
  selectedFrameId?: string;
  selectedSlotCrops?: Record<string, { scale: number; x: number; y: number }>;
  /** Per strip-slot Review person offsets nested in selected_slot_crops.__sameSpace. */
  sameSpaceSlotManualOffsets?: Record<string, {
    left: { offsetX: number; offsetY: number; scale: number; mode?: 'auto' | 'manual' };
    right: { offsetX: number; offsetY: number; scale: number; mode?: 'auto' | 'manual' };
    frontSlot?: 'left' | 'right';
  }>;
  /**
   * Absolute subject placements keyed by participant SubjectId, per span mode.
   * Nested in selected_slot_crops.__sameSpace.slotSubjectPlacements.
   */
  sameSpaceSlotSubjectPlacements?: Record<string, {
    one_cell: Record<string, { mode: 'auto' | 'manual'; rect: { x: number; y: number; width: number; height: number } | null }>;
    two_cell: Record<string, { mode: 'auto' | 'manual'; rect: { x: number; y: number; width: number; height: number } | null }>;
    frontSubjectId?: string | null;
  }>;
  /** Whole-strip scene width: one_cell (2:3) or two_cell (4:3). */
  sameSpaceSceneSpanMode?: 'one_cell' | 'two_cell';
  sameSpaceBackground?: SameSpaceBackground;
  sameSpaceFrontSlot?: 'left' | 'right';
  sameSpaceSoloLayout?: 'half' | 'center';
  compositionRevision?: number;
  leftParticipantId?: string | null;
  rightParticipantId?: string | null;
  /** Manual drag offsets keyed by participant user id. */
  participantTransforms?: Record<string, { offsetX: number; offsetY: number; scale: number }>;
  positionRevision?: number;
  selectionRevision?: number;
  /** Shared Review / export color mode. */
  colorMode?: 'color' | 'monochrome';
  expiresAt: string;
  finalImagePath?: string | null;
  memoryId?: string | null;
  finalizingClaimedBy?: string | null;
  hostReady: boolean;
  guestReady: boolean;
  errorReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BoothCandidate = {
  shotIndex: number;
  hostShot?: BoothShotRow;
  guestShot?: BoothShotRow;
};

export type ConnectParams = {
  url: string;
  token: string;
  roomName: string;
  userId: string;
  metadata: BoothParticipantMeta;
};

export type CaptureTimerPhase = 'idle' | 'running' | 'warn' | 'critical' | 'expired';
