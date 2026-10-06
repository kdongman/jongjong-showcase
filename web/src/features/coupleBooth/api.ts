import { canTransition } from '@shared/stateMachine';
import type { BoothSession, BoothSessionStatus, BoothShotRow } from '@shared/types';
import { parseParticipantTransforms } from '@shared/sameSpaceLayoutSpec';
import {
  applyAtomicSameSpaceCutoutFallback,
  logSameSpaceAssetMapping,
  pathLogSuffix,
  resolveSameSpaceShotAssets,
} from '@shared/sameSpaceAssets';
import {
  parseSameSpaceBackground,
  type SameSpaceBackground,
} from '@shared/sameSpaceBackground';
import {
  splitSlotCropsAndMeta,
} from '@shared/sameSpaceCompositionMeta';
import {
  assertValidBoothSessionId,
  normalizeActiveBoothSessionResult,
} from '@shared/entry';
import { maskId, toBoothTokenRequestError, type BoothTokenDiagnostics } from '@shared/tokenError';
import {
  BoothFinalizeError,
  toBoothFinalizeRequestError,
} from '@shared/finalizeError';
import { authExpiresInSec, resolveBoothAuthSession } from './utils/boothAuthSession';
import { readGuestLinkTokenCache, shouldUseGuestLinkTokenCache } from './utils/guestLinkTokenCache';
import { supabase } from '../../lib/supabase';
import { BUILD_INFO } from '../../lib/buildInfo';
import {
  createSignedBoothUrl,
  summarizeSignedUrlFailures,
  type SignedUrlFailure,
} from './utils/signedUrl';

const BUCKET = 'couple-booth';
const MAX_SHOT_SIDE = 1200;

export type BoothSignedUrlBundle = {
  urls: Record<string, string>;
  failures: SignedUrlFailure[];
  errorMessage: string | null;
};

export type BoothRoomImportRequest = {
  id: string;
  sessionId: string;
  shotId: string | null;
  status: 'pending' | 'completed' | 'dismissed';
};

/** Server derives couple ownership and makes repeated active requests idempotent. */
export async function requestBoothRoomImport(
  sessionId: string,
  shotId: string | null,
): Promise<BoothRoomImportRequest> {
  assertValidBoothSessionId(sessionId);
  const { data, error } = await supabase.rpc('request_couple_booth_room_import', {
    target_session: sessionId,
    target_shot: shotId,
  });
  if (error) throw error;
  const row = singleRpcRow(data);
  if (!row?.id) throw new Error('BOOTH_ROOM_IMPORT_INVALID');
  return {
    id: String(row.id),
    sessionId: String(row.booth_session_id),
    shotId: row.booth_shot_id ? String(row.booth_shot_id) : null,
    status: String(row.status) as BoothRoomImportRequest['status'],
  };
}

async function storageCreateSignedUrl(path: string, expiresIn: number): Promise<{ signedUrl: string }> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('SIGNED_URL_EMPTY');
  return { signedUrl: data.signedUrl };
}

function sanitizeRpcDiagnostic(value: string | null | undefined): string | null | undefined {
  return value?.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>')
    .replace(/access_token=[^&\s]+/gi, 'access_token=<redacted>');
}

function mapSession(row: Record<string, unknown>): BoothSession {
  assertValidBoothSessionId(row.id);
  const rawCrops = row.selected_slot_crops && typeof row.selected_slot_crops === 'object'
    ? row.selected_slot_crops as Record<string, unknown>
    : {};
  const { slotCrops, meta } = splitSlotCropsAndMeta(rawCrops);
  const columnBackground = row.same_space_background
    ? parseSameSpaceBackground(row.same_space_background)
    : null;
  return {
    id: String(row.id),
    coupleId: String(row.couple_id),
    hostUserId: String(row.host_user_id),
    guestUserId: String(row.guest_user_id),
    status: String(row.status) as BoothSessionStatus,
    livekitRoomName: String(row.livekit_room_name),
    currentShotIndex: Number(row.current_shot_index ?? 0),
    selectedShotIndexes: Array.isArray(row.selected_shot_indexes)
      ? row.selected_shot_indexes.map((value) => Number(value))
      : [],
    hostApproved: Boolean(row.host_approved),
    guestApproved: Boolean(row.guest_approved),
    hostReady: Boolean(row.host_ready),
    guestReady: Boolean(row.guest_ready),
    connectedAt: row.connected_at ? String(row.connected_at) : null,
    bothReadyAt: row.both_ready_at ? String(row.both_ready_at) : null,
    captureStartedAt: row.capture_started_at ? String(row.capture_started_at) : null,
    mediaExpiresAt: row.media_expires_at ? String(row.media_expires_at) : null,
    currentCaptureId: row.current_capture_id ? String(row.current_capture_id) : null,
    currentCaptureAt: row.current_capture_at ? String(row.current_capture_at) : null,
    sameSpaceEnabled: Boolean(row.same_space_enabled),
    selectedFrameId: row.selected_frame_id ? String(row.selected_frame_id) : 'classic',
    selectedSlotCrops: slotCrops,
    sameSpaceSlotManualOffsets: meta.slotManualOffsets ?? {},
    sameSpaceSlotSubjectPlacements: meta.slotSubjectPlacements ?? {},
    sameSpaceSceneSpanMode: meta.sceneSpanMode,
    sameSpaceBackground: columnBackground ?? meta.background,
    sameSpaceFrontSlot: row.same_space_front_slot === 'right' || meta.frontSlot === 'right' ? 'right' : 'left',
    sameSpaceSoloLayout: row.same_space_solo_layout === 'center' || meta.soloLayout === 'center' ? 'center' : 'half',
    compositionRevision: Number(row.composition_revision ?? meta.revision ?? 0) || 0,
    leftParticipantId: row.left_participant_id ? String(row.left_participant_id) : null,
    rightParticipantId: row.right_participant_id ? String(row.right_participant_id) : null,
    participantTransforms: parseParticipantTransforms(row.participant_transforms),
    positionRevision: Number(row.position_revision ?? 0) || 0,
    selectionRevision: Number(row.selection_revision ?? 0) || 0,
    colorMode: row.color_mode === 'monochrome' ? 'monochrome' : 'color',
    expiresAt: String(row.expires_at),
    finalImagePath: row.final_image_path ? String(row.final_image_path) : null,
    memoryId: row.memory_id ? String(row.memory_id) : null,
    finalizingClaimedBy: row.finalizing_claimed_by ? String(row.finalizing_claimed_by) : null,
    errorReason: row.error_reason ? String(row.error_reason) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function singleRpcRow(data: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(data) ? data.length === 1 ? data[0] : null : data;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return candidate as Record<string, unknown>;
}

function mapShot(row: Record<string, unknown>): BoothShotRow {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    shotIndex: Number(row.shot_index),
    captureId: String(row.capture_id),
    imagePath: String(row.image_path),
    capturedAt: String(row.captured_at),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    mirrorX: row.mirror_x == null ? true : Boolean(row.mirror_x),
    mirrorBakedIntoAsset: row.mirror_baked_into_asset == null ? true : Boolean(row.mirror_baked_into_asset),
    cameraFacing:
      row.camera_facing === 'user' || row.camera_facing === 'environment'
        ? row.camera_facing
        : 'unknown',
    cutoutPath: row.cutout_path ? String(row.cutout_path) : null,
    segmentationStatus: row.segmentation_status === 'ready' || row.segmentation_status === 'processing' || row.segmentation_status === 'failed' ? row.segmentation_status : 'not_requested',
  };
}

export function boothShotPath(
  coupleId: string,
  sessionId: string,
  userId: string,
  shotIndex: number,
  captureId?: string,
): string {
  const shot = `shot-${String(shotIndex).padStart(2, '0')}`;
  const version = captureId ? `-${captureId.replace(/-/g, '').slice(0, 10)}` : '';
  return `${coupleId}/${sessionId}/${userId}/${shot}${version}.jpg`;
}

export function boothFinalPath(coupleId: string, sessionId: string): string {
  return `${coupleId}/${sessionId}/final.jpg`;
}

export async function signedBoothUrl(
  path: string | undefined | null,
  options: {
    signal?: AbortSignal;
    soft?: boolean;
    sessionKey?: string;
    shotId?: string;
    shotIndex?: number;
    role?: string;
    assetStatus?: string;
  } = {},
): Promise<string | undefined> {
  if (!path) return undefined;
  const outcome = await createSignedBoothUrl(path, storageCreateSignedUrl, {
    signal: options.signal,
    soft: options.soft,
    sessionKey: options.sessionKey,
    shotId: options.shotId,
    shotIndex: options.shotIndex,
    role: options.role,
    assetStatus: options.assetStatus,
  });
  return outcome.url;
}

async function signShotPath(
  path: string | null | undefined,
  meta: {
    signal?: AbortSignal;
    kind: SignedUrlFailure['kind'];
    sessionKey?: string;
    shotId?: string;
    shotIndex?: number;
    role?: 'host' | 'guest';
    assetStatus?: string;
  },
): Promise<{ url?: string; failure?: SignedUrlFailure }> {
  if (!path) return {};
  const outcome = await createSignedBoothUrl(path, storageCreateSignedUrl, {
    signal: meta.signal,
    soft: true,
    sessionKey: meta.sessionKey,
    shotId: meta.shotId,
    shotIndex: meta.shotIndex,
    role: meta.role,
    assetStatus: meta.assetStatus,
  });
  if (outcome.url) return { url: outcome.url };
  return {
    failure: {
      pathSuffix: pathLogSuffix(path),
      kind: meta.kind,
      status: outcome.status,
      attempts: outcome.attempts,
      shotId: meta.shotId,
      role: meta.role,
    },
  };
}

export async function signedSameSpaceUrls(
  shots: BoothShotRow[],
  options: {
    signal?: AbortSignal;
    sessionKey?: string;
    hostUserId?: string;
    guestUserId?: string;
  } = {},
): Promise<BoothSignedUrlBundle> {
  const urls: Record<string, string> = {};
  const failures: SignedUrlFailure[] = [];
  const ready = shots.filter((shot) => shot.cutoutPath && shot.segmentationStatus === 'ready');
  await Promise.all(ready.map(async (shot) => {
    const role =
      options.hostUserId && shot.userId === options.hostUserId
        ? 'host'
        : options.guestUserId && shot.userId === options.guestUserId
          ? 'guest'
          : undefined;
    const result = await signShotPath(shot.cutoutPath, {
      signal: options.signal,
      kind: 'cutout',
      sessionKey: options.sessionKey,
      shotId: shot.id,
      shotIndex: shot.shotIndex,
      role,
      assetStatus: shot.segmentationStatus,
    });
    if (result.url) urls[`${shot.id}:cutout`] = result.url;
    if (result.failure) failures.push(result.failure);
  }));
  return { urls, failures, errorMessage: summarizeSignedUrlFailures(failures) };
}

async function uriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith('blob:') || uri.startsWith('data:') || uri.startsWith('http')) {
    const res = await fetch(uri);
    return res.blob();
  }
  throw new Error('UNSUPPORTED_URI');
}

async function resizeJpegBlob(blob: Blob, maxSide: number | null = MAX_SHOT_SIDE): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const scale = maxSide == null ? 1 : Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNSUPPORTED');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const out = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG_ENCODE_FAILED'))), 'image/jpeg', 0.92);
  });
  return { blob: out, width, height };
}

export async function uploadBoothJpeg(input: {
  path: string;
  uri: string;
  upsert?: boolean;
  /** Final strips must retain their canonical dimensions; shots are capped at 1200px. */
  maxSide?: number | null;
}): Promise<{ path: string; width?: number; height?: number }> {
  const source = await uriToBlob(input.uri);
  const resized = await resizeJpegBlob(
    source,
    input.maxSide === undefined ? MAX_SHOT_SIDE : input.maxSide,
  );
  const { error } = await supabase.storage.from(BUCKET).upload(input.path, resized.blob, {
    contentType: 'image/jpeg',
    upsert: input.upsert ?? false,
  });
  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    if (!msg.includes('exists') && (error as { statusCode?: string }).statusCode !== '409') {
      throw error;
    }
  }
  if (import.meta.env?.DEV) {
    console.info('[couple-booth][upload]', {
      pathSuffix: input.path.slice(-32),
      width: resized.width,
      height: resized.height,
      bytes: resized.blob.size,
      quality: 0.92,
    });
  }
  return { path: input.path, width: resized.width, height: resized.height };
}

export async function uploadBoothCutout(path: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png', upsert: true });
  if (error) throw error;
}

/** Upload a custom Same Space background image under the couple/session path. */
export async function uploadBoothBackgroundImage(input: {
  sessionId: string;
  file: File;
}): Promise<{ path: string; signedUrl: string }> {
  assertValidBoothSessionId(input.sessionId);
  // Couple identity comes from the session row / auth — never trust a client couple_id.
  const session = await getBoothSession(input.sessionId);
  if (!session) throw new Error('BOOTH_SESSION_NOT_FOUND');
  const coupleId = session.coupleId;
  const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
  if (!allowed.has(input.file.type)) throw new Error('INVALID_BACKGROUND_TYPE');
  if (input.file.size > 8 * 1024 * 1024) throw new Error('BACKGROUND_TOO_LARGE');

  const ext = input.file.type === 'image/png' ? 'png' : input.file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${coupleId}/${input.sessionId}/backgrounds/custom-${Date.now()}.${ext}`;

  const bitmap = await createImageBitmap(input.file);
  try {
    if (bitmap.width < 8 || bitmap.height < 8) throw new Error('BACKGROUND_TOO_SMALL');
    if (bitmap.width > 8000 || bitmap.height > 8000) throw new Error('BACKGROUND_DIMENSIONS_TOO_LARGE');
    const maxSide = 1920;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNSUPPORTED');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('BACKGROUND_ENCODE_FAILED'))),
        input.file.type === 'image/png' ? 'image/png' : input.file.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
        0.9,
      );
    });
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type,
      upsert: true,
    });
    if (error) throw error;
  } finally {
    bitmap.close();
  }
  const signedUrl = await signedBoothUrl(path);
  if (!signedUrl) throw new Error('BACKGROUND_URL_FAILED');
  return { path, signedUrl };
}

export async function saveBoothCutout(shotId: string, path: string, status: 'processing' | 'ready' | 'failed'): Promise<void> {
  const { error } = await supabase.from('couple_booth_shots').update({ cutout_path: status === 'ready' ? path : null, segmentation_status: status }).eq('id', shotId);
  if (error) throw error;
}

export async function uploadFinalBoothJpeg(input: {
  coupleId: string;
  sessionId: string;
  uri: string;
}): Promise<{ path: string; width?: number; height?: number }> {
  return uploadBoothJpeg({
    path: boothFinalPath(input.coupleId, input.sessionId),
    uri: input.uri,
    upsert: true,
    maxSide: null,
  });
}

/** Returns the caller's current Booth, or creates exactly one under the DB lock. */
export async function getOrCreateBoothSession(): Promise<BoothSession> {
  const { data, error } = await supabase.rpc('get_or_create_active_couple_booth_entry');
  if (error) throw error;
  const entry = normalizeActiveBoothSessionResult(data);
  const session = await getBoothSession(entry.sessionId);
  if (!session) throw new Error('BOOTH_SESSION_NOT_FOUND_AFTER_ENTRY');
  return session;
}

/** Read-only home-page lookup. Couple and participant identity come from auth.uid(). */
export async function getMyActiveBoothSession(): Promise<BoothSession | null> {
  const { data, error } = await supabase.rpc('get_active_couple_booth_session');
  if (error) throw error;
  if (data == null) return null;
  const row = singleRpcRow(data);
  if (!row?.id) return null;
  return mapSession(row);
}

export async function getBoothSession(sessionId: string): Promise<BoothSession | null> {
  if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
    throw new Error('INVALID_BOOTH_SESSION_ID');
  }
  assertValidBoothSessionId(sessionId);
  const { data, error } = await supabase.from('couple_booth_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (error) throw error;
  return data ? mapSession(data as Record<string, unknown>) : null;
}

export async function respondBoothSession(sessionId: string, accept: boolean): Promise<BoothSession> {
  if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
    throw new Error('INVALID_BOOTH_SESSION_ID');
  }
  const { data, error } = await supabase.rpc('respond_couple_booth_session', {
    target_session: sessionId,
    accept,
  });
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export async function cancelBoothSession(sessionId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_couple_booth_session', {
    target_session: sessionId,
    reason,
  });
  if (error) throw error;
}

export async function updateBoothSessionStatus(
  sessionId: string,
  from: BoothSessionStatus,
  to: BoothSessionStatus,
  patch: Record<string, unknown> = {},
): Promise<BoothSession> {
  if (!canTransition(from, to)) throw new Error(`INVALID_BOOTH_TRANSITION:${from}->${to}`);
  if (to !== 'review' || Object.keys(patch).length > 0) {
    throw new Error(`UNSUPPORTED_SERVER_TRANSITION:${from}->${to}`);
  }
  const { data, error } = await supabase.rpc('move_couple_booth_to_review', {
    target_session: sessionId,
    expected_status: from,
  });
  if (error) throw error;
  if (!data) {
    const current = await getBoothSession(sessionId);
    if (!current) throw new Error('SESSION_NOT_FOUND');
    if (current.status === to) return current;
    throw new Error(`STATUS_UPDATE_CONFLICT:${current.status}`);
  }
  return mapSession(data as Record<string, unknown>);
}

export async function markBoothConnected(sessionId: string): Promise<BoothSession> {
  const { data, error } = await supabase.rpc('mark_couple_booth_connected', { target_session: sessionId });
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export async function setBoothReady(sessionId: string, isHost: boolean): Promise<BoothSession> {
  void isHost;
  const { data, error } = await supabase.rpc('set_couple_booth_ready', { target_session: sessionId });
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export async function setSameSpaceMode(sessionId: string, enabled: boolean): Promise<BoothSession> {
  const { data, error } = await supabase.rpc('set_couple_booth_same_space_mode', { target_session: sessionId, enabled });
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

/** Host-only: atomically starts the server-authoritative 90s capture clock. */
export async function startBoothCapture(sessionId: string): Promise<BoothSession> {
  const { data, error } = await supabase.rpc('start_couple_booth_capture', { target_session: sessionId });
  if (error) {
    const diagnostics = {
      code: sanitizeRpcDiagnostic(error.code),
      message: sanitizeRpcDiagnostic(error.message),
      details: sanitizeRpcDiagnostic(error.details),
      hint: sanitizeRpcDiagnostic(error.hint),
      sessionKey: sessionId.slice(-8),
    };
    console.error('[couple-booth][capture-start]', { event: 'rpc-failed', ...diagnostics });
    const captureError = new Error(diagnostics.message ?? 'CAPTURE_START_FAILED');
    captureError.name = 'BoothCaptureStartError';
    Object.assign(captureError, diagnostics);
    throw captureError;
  }
  return mapSession(data as Record<string, unknown>);
}

/** Host-only: stores the next shot's absolute capture time on the server. */
export async function scheduleBoothShot(sessionId: string, shotIndex: number): Promise<BoothSession> {
  const { data, error } = await supabase.rpc('schedule_couple_booth_shot', {
    target_session: sessionId,
    requested_shot_index: shotIndex,
  });
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

/** Participant-scoped wall-clock sample for converting a DB timestamp locally. */
export async function getBoothServerTime(sessionId: string): Promise<number> {
  const sentAt = Date.now();
  const { data, error } = await supabase.rpc('get_couple_booth_server_time', { target_session: sessionId });
  const receivedAt = Date.now();
  if (error) throw error;
  const serverAt = Date.parse(String(data));
  if (!Number.isFinite(serverAt)) throw new Error('INVALID_SERVER_TIME');
  // Midpoint bounds the local/server offset without trusting the browser clock
  // as the capture source of truth.
  return (sentAt + receivedAt) / 2 - serverAt;
}

export async function updateBoothSelection(
  sessionId: string,
  selectedShotIndexes: number[],
  expectedRevision?: number | null,
): Promise<BoothSession> {
  const payload: Record<string, unknown> = {
    target_session: sessionId,
    selected: selectedShotIndexes,
  };
  if (expectedRevision != null) payload.expected_revision = expectedRevision;
  const { data, error } = await supabase.rpc('set_couple_booth_selection', payload);
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export async function updateBoothPositions(
  sessionId: string,
  leftParticipantId: string,
  rightParticipantId: string,
  expectedRevision?: number | null,
): Promise<BoothSession> {
  const payload: Record<string, unknown> = {
    target_session: sessionId,
    desired_left: leftParticipantId,
    desired_right: rightParticipantId,
  };
  if (expectedRevision != null) payload.expected_revision = expectedRevision;
  const { data, error } = await supabase.rpc('set_couple_booth_positions', payload);
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export async function swapBoothPositions(
  sessionId: string,
  expectedRevision?: number | null,
): Promise<BoothSession> {
  const payload: Record<string, unknown> = { target_session: sessionId };
  if (expectedRevision != null) payload.expected_revision = expectedRevision;
  const { data, error } = await supabase.rpc('swap_couple_booth_positions', payload);
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export type BoothPositionCapabilities = {
  positions: boolean;
  swap: boolean;
  transforms: boolean;
  selectionRevision: boolean;
};

export async function probeBoothPositionCapabilities(): Promise<BoothPositionCapabilities | null> {
  const { data, error } = await supabase.rpc('couple_booth_position_capabilities');
  if (error) {
    // 404 / missing function → treat as undeployed.
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    positions: Boolean(row.positions),
    swap: Boolean(row.swap),
    transforms: Boolean(row.transforms),
    selectionRevision: Boolean(row.selectionRevision ?? row.selection_revision),
  };
}

export async function updateBoothParticipantTransform(
  sessionId: string,
  userId: string,
  offset: { offsetX: number; offsetY: number; scale?: number },
  expectedRevision?: number | null,
): Promise<BoothSession> {
  const payload: Record<string, unknown> = {
    target_session: sessionId,
    target_user: userId,
    offset_x: offset.offsetX,
    offset_y: offset.offsetY,
    scale: offset.scale ?? 1,
  };
  if (expectedRevision != null) payload.expected_revision = expectedRevision;
  const { data, error } = await supabase.rpc('set_couple_booth_participant_transform', payload);
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export async function updateBoothStyle(
  sessionId: string,
  options: {
    background?: SameSpaceBackground | null;
    colorMode?: 'color' | 'monochrome' | null;
    expectedRevision?: number | null;
  },
): Promise<BoothSession> {
  const payload: Record<string, unknown> = {
    target_session: sessionId,
    background: options.background ?? null,
    next_color_mode: options.colorMode ?? null,
  };
  if (options.expectedRevision != null) payload.expected_revision = options.expectedRevision;
  const { data, error } = await supabase.rpc('set_couple_booth_style', payload);
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export async function updateBoothComposition(
  sessionId: string,
  frameId: string,
  crops: Record<string, unknown>,
  options?: {
    background?: SameSpaceBackground;
    frontSlot?: 'left' | 'right';
    soloLayout?: 'half' | 'center';
  },
): Promise<BoothSession> {
  // Single PostgREST-safe signature with optional extras. Avoid dual overloads.
  const payload: Record<string, unknown> = {
    target_session: sessionId,
    frame_id: frameId,
    crops,
    background: options?.background ?? null,
    front_slot: options?.frontSlot ?? null,
    solo_layout: options?.soloLayout ?? null,
  };

  let { data, error } = await supabase.rpc('set_couple_booth_composition', payload);
  // Pre-migration deployments only expose the historical 3-arg function.
  if (error) {
    const fallback = await supabase.rpc('set_couple_booth_composition', {
      target_session: sessionId,
      frame_id: frameId,
      crops,
    });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export async function updateBoothApproval(
  sessionId: string,
  role: 'host' | 'guest',
  approved: boolean,
): Promise<BoothSession> {
  void role; // The database derives the role from auth.uid().
  const { data, error } = await supabase.rpc('set_couple_booth_approval', {
    target_session: sessionId,
    approved,
  });
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export async function listBoothShots(sessionId: string): Promise<BoothShotRow[]> {
  assertValidBoothSessionId(sessionId);
  const { data, error } = await supabase
    .from('couple_booth_shots')
    .select('*')
    .eq('session_id', sessionId)
    .order('shot_index', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapShot(row as Record<string, unknown>));
}

export async function upsertBoothShot(input: {
  sessionId: string;
  coupleId: string;
  userId: string;
  shotIndex: number;
  captureId: string;
  uri: string;
  capturedAt: number;
  mirrorX: boolean;
  mirrorBakedIntoAsset: boolean;
  cameraFacing: 'user' | 'environment' | 'unknown';
}): Promise<BoothShotRow> {
  const path = boothShotPath(input.coupleId, input.sessionId, input.userId, input.shotIndex, input.captureId);
  const uploaded = await uploadBoothJpeg({ path, uri: input.uri, upsert: false });
  const { data, error } = await supabase
    .from('couple_booth_shots')
    .upsert(
      {
        session_id: input.sessionId,
        user_id: input.userId,
        shot_index: input.shotIndex,
        capture_id: input.captureId,
        image_path: uploaded.path,
        captured_at: new Date(input.capturedAt).toISOString(),
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        mirror_x: input.mirrorX,
        mirror_baked_into_asset: input.mirrorBakedIntoAsset,
        camera_facing: input.cameraFacing,
      },
      { onConflict: 'session_id,user_id,shot_index' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return mapShot(data as Record<string, unknown>);
}

function supabaseProjectRef(): string | undefined {
  const raw = import.meta.env.VITE_SUPABASE_URL;
  if (!raw || typeof raw !== 'string') return undefined;
  try {
    return new URL(raw).hostname.split('.')[0] || undefined;
  } catch {
    return undefined;
  }
}

export async function requestBoothLiveKitToken(
  sessionId: string,
  diagnostics?: BoothTokenDiagnostics & { expectedUserId?: string },
): Promise<{ token: string; url: string; roomName: string }> {
  assertValidBoothSessionId(sessionId);

  const guestMode = typeof sessionStorage !== 'undefined'
    && shouldUseGuestLinkTokenCache(sessionId, sessionStorage);

  // Guest-link page only: reuse the claim-issued LiveKit JWT.
  // Couple-auth joins must never reuse ephemeral guest-link JWTs.
  if (guestMode && typeof sessionStorage !== 'undefined') {
    const cached = readGuestLinkTokenCache(sessionId, sessionStorage);
    if (cached) return cached;
  }

  const auth = await resolveBoothAuthSession({
    getSession: () => supabase.auth.getSession(),
    refreshSession: () => supabase.auth.refreshSession(),
    expectedUserId: diagnostics?.expectedUserId,
  });

  const safeDiagnostics: BoothTokenDiagnostics = {
    ...diagnostics,
    guestMode,
    authSessionPresent: true,
    authUserIdMasked: maskId(auth.userId),
    authExpiresInSec: authExpiresInSec(auth.expiresAt),
    vercelOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
    supabaseProjectRef: supabaseProjectRef(),
    boothSessionIdMasked: maskId(sessionId),
    retryCount: diagnostics?.retryCount ?? 0,
  };
  console.info('[couple-booth-token][auth]', {
    ...safeDiagnostics,
    refreshed: auth.refreshed,
    build: BUILD_INFO,
  });

  // Pass the just-validated access token explicitly so invoke never uses a
  // stale module-level JWT from a different client instance.
  const { data, error } = await supabase.functions.invoke('couple-booth-token', {
    body: { sessionId },
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
    },
  });
  if (error) throw await toBoothTokenRequestError(error, safeDiagnostics);
  const url = data?.url || import.meta.env.VITE_LIVEKIT_URL;
  if (!data?.token || !url || !data?.roomName) throw new Error('TOKEN_RESPONSE_INVALID');
  return { token: String(data.token), url: String(url), roomName: String(data.roomName) };
}

export type BoothGuestLinkInfo = {
  id: string;
  sessionId: string;
  url: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  claimedAt: string | null;
  revokedAt: string | null;
};

export async function createBoothGuestLink(sessionId: string): Promise<BoothGuestLinkInfo> {
  assertValidBoothSessionId(sessionId);
  const { data, error } = await supabase.functions.invoke('couple-booth-guest-link-create', {
    body: { sessionId },
  });
  if (error) throw error;
  if (!data?.url || !data?.id) throw new Error('GUEST_LINK_CREATE_FAILED');
  return {
    id: String(data.id),
    sessionId: String(data.sessionId ?? sessionId),
    url: String(data.url),
    expiresAt: String(data.expiresAt),
    maxUses: Number(data.maxUses ?? 1),
    useCount: Number(data.useCount ?? 0),
    claimedAt: data.claimedAt ? String(data.claimedAt) : null,
    revokedAt: data.revokedAt ? String(data.revokedAt) : null,
  };
}

export async function revokeBoothGuestLink(linkId: string): Promise<void> {
  if (!linkId || linkId === 'null') throw new Error('INVALID_LINK_ID');
  const { error } = await supabase.functions.invoke('couple-booth-guest-link-revoke', {
    body: { linkId },
  });
  if (error) throw error;
}

export async function listBoothGuestLinks(sessionId: string): Promise<BoothGuestLinkInfo[]> {
  assertValidBoothSessionId(sessionId);
  const { data, error } = await supabase
    .from('couple_booth_guest_links')
    .select('id, session_id, expires_at, max_uses, use_count, claimed_at, revoked_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    sessionId: String(row.session_id),
    url: '',
    expiresAt: String(row.expires_at),
    maxUses: Number(row.max_uses ?? 1),
    useCount: Number(row.use_count ?? 0),
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  }));
}

export async function redeemBoothGuestLink(rawToken: string): Promise<{
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  livekit: { token: string; url: string; roomName: string; identity: string };
}> {
  const token = rawToken.trim();
  if (!token || token.length < 20) throw new Error('GUEST_LINK_INVALID');
  const { data, error } = await supabase.functions.invoke('couple-booth-guest-link-redeem', {
    body: { token },
  });
  if (error) throw error;
  if (!data?.sessionId || !data?.accessToken || !data?.refreshToken || !data?.livekit?.token) {
    throw new Error('GUEST_LINK_INVALID');
  }
  return {
    sessionId: String(data.sessionId),
    accessToken: String(data.accessToken),
    refreshToken: String(data.refreshToken),
    livekit: {
      token: String(data.livekit.token),
      url: String(data.livekit.url),
      roomName: String(data.livekit.roomName),
      identity: String(data.livekit.identity ?? ''),
    },
  };
}

export type BoothInviteNotificationResult = {
  sent: number;
  rejected: number;
  deduplicated?: boolean;
};

/** Notification failure never changes the session outcome or blocks Booth entry. */
export async function notifyBoothInvite(sessionId: string): Promise<BoothInviteNotificationResult> {
  assertValidBoothSessionId(sessionId);
  const { data, error } = await supabase.functions.invoke('send-booth-invite-notification', { body: { sessionId } });
  if (error) throw error;
  return {
    sent: Number(data?.sent ?? 0),
    rejected: Number(data?.rejected ?? 0),
    deduplicated: Boolean(data?.deduplicated),
  };
}

export async function createBoothMemory(input: {
  userId: string;
  coupleId: string;
  sessionId: string;
  selectedShotIndexes: number[];
  participantIds: string[];
  finalBlobUri: string;
  solo: boolean;
}): Promise<string> {
  // The server owns the one-to-one session <-> Memory link. Client fields are
  // retained in this API shape for callers, but are never trusted for identity.
  void input.userId;
  void input.coupleId;
  void input.selectedShotIndexes;
  void input.participantIds;
  void input.solo;
  const { data, error } = await supabase.rpc('create_couple_booth_memory', {
    target_session: input.sessionId,
  });
  if (error) throw error;
  const memoryId = String(data);
  const blob = await (await fetch(input.finalBlobUri)).blob();
  const photoPath = `couples/${input.coupleId}/memories/${memoryId}/main.jpg`;
  const { error: uploadError } = await supabase.storage.from('memories').upload(photoPath, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadError && !String(uploadError.message ?? '').toLowerCase().includes('exists')) {
    throw uploadError;
  }
  const { error: updateError } = await supabase
    .from('memories')
    .update({ image_path: photoPath })
    .eq('id', memoryId)
    .eq('author_id', input.userId);
  if (updateError) throw updateError;
  return memoryId;
}

export async function claimBoothFinalization(input: {
  sessionId: string;
  selectedShotIndexes: number[];
  allowHostSolo?: boolean;
}): Promise<BoothSession> {
  const { data, error } = await supabase.rpc('claim_couple_booth_finalization', {
    target_session: input.sessionId,
    selected: input.selectedShotIndexes,
    allow_host_solo: Boolean(input.allowHostSolo),
  });
  if (error) throw error;
  return mapSession(data as Record<string, unknown>);
}

export type BoothClaimOutcome =
  | { kind: 'won'; session: BoothSession }
  | { kind: 'recover_completed'; session: BoothSession }
  | { kind: 'claimed_by_other'; session: BoothSession };

export async function beginBoothFinalization(input: {
  sessionId: string;
  selectedShotIndexes: number[];
  allowHostSolo?: boolean;
  actorId: string;
}): Promise<BoothClaimOutcome> {
  const claimed = await claimBoothFinalization({
    sessionId: input.sessionId,
    selectedShotIndexes: input.selectedShotIndexes,
    allowHostSolo: input.allowHostSolo,
  });
  if (claimed.status === 'completed' && claimed.finalImagePath) {
    return { kind: 'recover_completed', session: claimed };
  }
  if (claimed.finalizingClaimedBy && claimed.finalizingClaimedBy !== input.actorId) {
    return { kind: 'claimed_by_other', session: claimed };
  }
  return { kind: 'won', session: claimed };
}

export async function waitForBoothCompletion(sessionId: string, timeoutMs = 45_000): Promise<BoothSession> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const latest = await getBoothSession(sessionId);
    if (latest?.status === 'completed' && latest.finalImagePath) return latest;
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  throw new Error('FINALIZE_WAIT_TIMEOUT');
}

export async function completeBoothSession(input: {
  sessionId: string;
  /** Must be the session's couple_id — never a client-guessed alternate couple. */
  coupleId: string;
  finalUri: string;
  memoryId?: string | null;
  selectedShotIndexes: number[];
  allowHostSolo?: boolean;
  finalizeRequestId?: string;
}): Promise<BoothSession> {
  assertValidBoothSessionId(input.sessionId);
  if (input.selectedShotIndexes.length !== 4) {
    throw new BoothFinalizeError(400, 'INVALID_SELECTION_COUNT');
  }

  const expectedPath = boothFinalPath(input.coupleId, input.sessionId);
  const uploaded = await uploadFinalBoothJpeg({
    coupleId: input.coupleId,
    sessionId: input.sessionId,
    uri: input.finalUri,
  });
  if (uploaded.path !== expectedPath) {
    throw new BoothFinalizeError(400, 'INVALID_FINAL_PATH', input.finalizeRequestId, uploaded.path);
  }

  const auth = await resolveBoothAuthSession({
    getSession: () => supabase.auth.getSession(),
    refreshSession: () => supabase.auth.refreshSession(),
  });

  const diagnostics = {
    finalizeRequestId: input.finalizeRequestId,
    sessionIdMasked: maskId(input.sessionId),
    selectedShotCount: input.selectedShotIndexes.length,
  };

  // Single authoritative path: browser → Edge Function → RPC.
  // Never fall back to direct complete_couple_booth_session from the browser.
  const { data: edgeData, error: edgeError } = await supabase.functions.invoke('finalize-couple-booth', {
    body: {
      sessionId: input.sessionId,
      finalImagePath: uploaded.path,
      memoryId: input.memoryId ?? null,
      selectedShotIndexes: input.selectedShotIndexes,
      allowHostSolo: Boolean(input.allowHostSolo),
      finalizeRequestId: input.finalizeRequestId ?? crypto.randomUUID(),
    },
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
    },
  });

  if (edgeError) {
    throw await toBoothFinalizeRequestError(edgeError, diagnostics);
  }

  if (edgeData?.claimedByOther || edgeData?.code === 'CLAIMED_BY_OTHER') {
    throw new BoothFinalizeError(
      409,
      'CLAIMED_BY_OTHER',
      typeof edgeData?.request_id === 'string' ? edgeData.request_id : input.finalizeRequestId,
    );
  }

  if (edgeData?.session) {
    const session = mapSession(edgeData.session as Record<string, unknown>);
    if (edgeData.recovered || edgeData.code === 'ALREADY_FINALIZED' || session.status === 'completed') {
      return session;
    }
    throw new BoothFinalizeError(
      409,
      'INVALID_SESSION_STATE',
      typeof edgeData?.request_id === 'string' ? edgeData.request_id : input.finalizeRequestId,
      session.status,
    );
  }

  throw new BoothFinalizeError(500, 'INTERNAL_FINALIZE_ERROR', input.finalizeRequestId, 'EMPTY_FINALIZE_RESPONSE');
}

export async function subscribeBoothSession(sessionId: string, onChange: () => void): Promise<() => void> {
  assertValidBoothSessionId(sessionId);
  const channel = supabase
    .channel(`couple-booth-web:${sessionId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'couple_booth_sessions', filter: `id=eq.${sessionId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'couple_booth_shots', filter: `session_id=eq.${sessionId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Realtime wake-up for the one active session card on the Booth home. */
export async function subscribeCoupleBoothSessions(coupleId: string, onChange: () => void): Promise<() => void> {
  if (!coupleId || coupleId === 'null' || coupleId === 'undefined') {
    return () => undefined;
  }
  const channel = supabase
    .channel(`couple-booth-home:${coupleId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'couple_booth_sessions', filter: `couple_id=eq.${coupleId}` },
      onChange,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function signedShotUrls(
  shots: BoothShotRow[],
  options: {
    signal?: AbortSignal;
    sessionKey?: string;
    hostUserId?: string;
    guestUserId?: string;
  } = {},
): Promise<BoothSignedUrlBundle> {
  const urls: Record<string, string> = {};
  const failures: SignedUrlFailure[] = [];
  await Promise.all(
    shots.map(async (shot) => {
      const role =
        options.hostUserId && shot.userId === options.hostUserId
          ? 'host'
          : options.guestUserId && shot.userId === options.guestUserId
            ? 'guest'
            : undefined;
      const result = await signShotPath(shot.imagePath, {
        signal: options.signal,
        kind: 'original',
        sessionKey: options.sessionKey,
        shotId: shot.id,
        shotIndex: shot.shotIndex,
        role,
        assetStatus: 'original',
      });
      if (result.url) urls[shot.id] = result.url;
      if (result.failure) failures.push(result.failure);
    }),
  );
  return { urls, failures, errorMessage: summarizeSignedUrlFailures(failures) };
}

/** Load original + cutout URLs with per-asset isolation and atomic Same Space fallback. */
export async function loadBoothReviewUrls(input: {
  shots: BoothShotRow[];
  hostUserId: string;
  guestUserId: string;
  sessionKey: string;
  signal?: AbortSignal;
}): Promise<BoothSignedUrlBundle> {
  const [originals, cutouts] = await Promise.all([
    signedShotUrls(input.shots, {
      signal: input.signal,
      sessionKey: input.sessionKey,
      hostUserId: input.hostUserId,
      guestUserId: input.guestUserId,
    }),
    signedSameSpaceUrls(input.shots, {
      signal: input.signal,
      sessionKey: input.sessionKey,
      hostUserId: input.hostUserId,
      guestUserId: input.guestUserId,
    }),
  ]);

  const merged = applyAtomicSameSpaceCutoutFallback(
    { ...originals.urls, ...cutouts.urls },
    input.shots,
    input.hostUserId,
    input.guestUserId,
  );

  const indexes = new Set(input.shots.map((shot) => shot.shotIndex));
  for (const shotIndex of indexes) {
    const assets = resolveSameSpaceShotAssets(
      input.shots,
      shotIndex,
      input.hostUserId,
      input.guestUserId,
    );
    logSameSpaceAssetMapping({
      sessionKey: input.sessionKey,
      shotIndex,
      assets,
      hostCutoutStatus: assets?.hostShot.segmentationStatus,
      guestCutoutStatus: assets?.guestShot.segmentationStatus,
    });
  }

  const failures = [...originals.failures, ...cutouts.failures];
  return {
    urls: merged,
    failures,
    errorMessage: summarizeSignedUrlFailures(failures),
  };
}
