import {
  appearanceForLegacyTheme,
  createBoothRoomSnapshot,
  normalizeCutoutPlacementType,
  normalizePetRoomFloorStyleId,
  normalizePetRoomWallStyleId,
  normalizeRoomItemFlipX,
  normalizeRoomItemFrameFields,
  normalizeRoomMailboxPlacement,
  normalizeOurBloomPlacement,
  normalizeRoomPhoto,
  normalizeRoomTextObject,
  normalizeRoomTitleStyle,
  type BoothRoomSnapshot,
  type CouplePetRoom,
  type RoomSpaceKey,
  type PetRoomCutoutAsset,
  type PetRoomFrameSize,
  type PetRoomFrameStyle,
  type PetRoomItem,
  type PetRoomItemKind,
  type PetRoomPhoto,
  type PetRoomThemeId,
} from '@couplePet';
import {
  backgroundPathBelongsToSession,
  isOurRoomBackground,
  ourRoomFrontPlatePath,
  type SameSpaceBackground,
} from '@shared/sameSpaceBackground';
import { supabase } from '../../../lib/supabase';
import { fetchCouplePets } from '../petApi';
import type { CouplePet } from '../companions/couplePetBoothAdapter';

const ROOM_BUCKET = 'couple-pet-rooms';
const BOOTH_BUCKET = 'couple-booth';

function themeId(value: unknown): PetRoomThemeId {
  return value === 'warm_cream' || value === 'soft_night' ? value : 'cozy_lavender';
}

function mapItem(row: Record<string, unknown>): PetRoomItem {
  const catalogItemId = row.catalog_item_id as PetRoomItemKind;
  const photo = normalizeRoomPhoto({
    sourceType: row.photo_source_type as PetRoomPhoto['sourceType'] | undefined,
    sourceId: row.photo_source_id ? String(row.photo_source_id) : null,
    bucket: row.photo_bucket as PetRoomPhoto['bucket'] | undefined,
    path: row.photo_path == null ? undefined : String(row.photo_path),
    width: row.photo_width == null ? null : Number(row.photo_width),
    height: row.photo_height == null ? null : Number(row.photo_height),
    focalX: row.crop_focal_x == null ? undefined : Number(row.crop_focal_x),
    focalY: row.crop_focal_y == null ? undefined : Number(row.crop_focal_y),
    zoom: row.crop_zoom == null ? undefined : Number(row.crop_zoom),
  });
  const frame = normalizeRoomItemFrameFields({
    catalogItemId,
    frameSize: (row.frame_size as PetRoomFrameSize | null) ?? null,
    frameStyle: (row.frame_style as PetRoomFrameStyle | null) ?? null,
    normalizedWidth: row.normalized_width == null ? null : Number(row.normalized_width),
    normalizedHeight: row.normalized_height == null ? null : Number(row.normalized_height),
  });
  const cutout = catalogItemId === 'cutout' && row.asset_path && row.asset_bucket === ROOM_BUCKET
    ? {
        bucket: ROOM_BUCKET,
        path: String(row.asset_path),
        width: Math.max(1, Number(row.intrinsic_width ?? 1)),
        height: Math.max(1, Number(row.intrinsic_height ?? 1)),
        anchorX: Math.max(0, Math.min(1, Number(row.anchor_x ?? 0.5))),
        anchorY: Math.max(0, Math.min(1, Number(row.anchor_y ?? 1))),
      } satisfies PetRoomCutoutAsset
    : null;
  return {
    id: String(row.id), roomId: String(row.room_id), catalogItemId,
    x: Number(row.normalized_x), y: Number(row.normalized_y), scale: Number(row.scale ?? 1),
    rotation: Number(row.rotation ?? 0), flipX: normalizeRoomItemFlipX(catalogItemId, row.flip_x),
    zIndex: Number(row.z_index ?? 0), isLocked: row.is_locked === true, photo, cutout,
    cutoutAssetId: row.cutout_asset_id == null ? null : String(row.cutout_asset_id),
    placementType: catalogItemId === 'cutout' ? normalizeCutoutPlacementType(row.placement_type) : undefined,
    surfaceHostItemId: catalogItemId === 'cutout' && row.surface_host_item_id ? String(row.surface_host_item_id) : null,
    surfaceId: catalogItemId === 'cutout' && row.surface_id ? String(row.surface_id) : null,
    surfaceLocalX: catalogItemId === 'cutout' && row.surface_local_x != null ? Number(row.surface_local_x) : null,
    frameSize: frame.frameSize, frameStyle: frame.frameStyle,
    normalizedWidth: frame.normalizedWidth, normalizedHeight: frame.normalizedHeight,
    textObject: catalogItemId === 'text' ? normalizeRoomTextObject(row.text_object, 'plain') : null,
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

async function signRoomMedia(item: PetRoomItem): Promise<PetRoomItem> {
  const sign = async (bucket: string, path: string) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw error ?? new Error('ROOM_MEDIA_URL_EMPTY');
    return data.signedUrl;
  };
  return {
    ...item,
    photo: item.photo ? { ...item.photo, signedUrl: await sign(item.photo.bucket, item.photo.path) } : null,
    cutout: item.cutout ? { ...item.cutout, signedUrl: await sign(item.cutout.bucket, item.cutout.path) } : null,
  };
}

function roomPetPlacements(rows: readonly Record<string, unknown>[]): Record<string, { x: number; y: number }> {
  return Object.fromEntries(rows.flatMap((row) => (
    row.normalized_x == null || row.normalized_y == null
      ? []
      : [[String(row.pet_id), { x: Number(row.normalized_x), y: Number(row.normalized_y) }]]
  )));
}

/** Couple-scoped read only. It never calls the Room ensure/upsert RPC. */
export async function loadBoothRoomSnapshot(
  coupleId: string,
  includePets = true,
): Promise<BoothRoomSnapshot> {
  const { data: roomData, error: roomError } = await supabase
    .from('couple_pet_rooms').select('*').eq('couple_id', coupleId).maybeSingle();
  if (roomError) throw roomError;
  if (!roomData) throw new Error('OUR_ROOM_NOT_FOUND');
  const row = roomData as Record<string, unknown>;
  const roomId = String(row.id);
  const [{ data: itemData, error: itemError }, { data: roomPetData, error: roomPetError }, pets] = await Promise.all([
    supabase.from('couple_pet_room_items').select('*').eq('room_id', roomId).order('z_index').order('created_at'),
    supabase.from('couple_pet_room_pets').select('pet_id,is_visible,sort_order,normalized_x,normalized_y').eq('room_id', roomId).order('sort_order'),
    fetchCouplePets(coupleId),
  ]);
  if (itemError) throw itemError;
  if (roomPetError) throw roomPetError;
  const items = await Promise.all((itemData ?? []).map((entry) => signRoomMedia(mapItem(entry as Record<string, unknown>))));
  const roomPetRows = (roomPetData ?? []) as Record<string, unknown>[];
  const legacy = appearanceForLegacyTheme(themeId(row.theme_id));
  const room: CouplePetRoom = {
    id: roomId, coupleId,
    spaceKey: String(row.space_key ?? 'our_room') as RoomSpaceKey,
    sortOrder: Number(row.sort_order ?? 0),
    themeId: themeId(row.theme_id),
    displayName: null,
    titleStyle: normalizeRoomTitleStyle(row.title_style),
    mailboxPlacement: normalizeRoomMailboxPlacement({
      x: row.mailbox_normalized_x,
      y: row.mailbox_normalized_y,
    }),
    ourBloomPlacement: normalizeOurBloomPlacement({
      x: row.our_bloom_normalized_x,
      y: row.our_bloom_normalized_y,
      scale: row.our_bloom_scale,
      rotation: row.our_bloom_rotation,
    }),
    wallStyleId: row.wall_style_id == null ? legacy.wallStyleId : normalizePetRoomWallStyleId(row.wall_style_id),
    floorStyleId: row.floor_style_id == null ? legacy.floorStyleId : normalizePetRoomFloorStyleId(row.floor_style_id),
    visiblePetIds: roomPetRows.filter((entry) => Boolean(entry.is_visible)).map((entry) => String(entry.pet_id)),
    todayFeaturedPetId: null, todayVisiblePetIds: null,
    petPlacements: roomPetPlacements(roomPetRows), bedroomPetPlacements: {}, bedroomRestingPetIds: [],
    items, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
  return createBoothRoomSnapshot({
    room,
    pets: pets.filter((pet): pet is CouplePet & { species: NonNullable<CouplePet['species']> } => pet.species != null),
    includePets,
  });
}

function platePath(coupleId: string, sessionId: string, snapshotKey: string, plate: 'back' | 'front'): string {
  return `${coupleId}/${sessionId}/backgrounds/our-room-${snapshotKey}-${plate}.png`;
}

export async function uploadBoothRoomPlates(input: {
  coupleId: string;
  sessionId: string;
  snapshotKey: string;
  includePets: boolean;
  back: Blob;
  front: Blob;
}): Promise<Extract<SameSpaceBackground, { type: 'image' }>> {
  const backPath = platePath(input.coupleId, input.sessionId, input.snapshotKey, 'back');
  const frontPath = platePath(input.coupleId, input.sessionId, input.snapshotKey, 'front');
  const upload = (path: string, body: Blob) => supabase.storage.from(BOOTH_BUCKET).upload(path, body, {
    contentType: 'image/png', upsert: true,
  });
  const [backUpload, frontUpload] = await Promise.all([upload(backPath, input.back), upload(frontPath, input.front)]);
  if (backUpload.error) throw backUpload.error;
  if (frontUpload.error) throw frontUpload.error;
  const [{ data: backSigned, error: backSignError }, { data: frontSigned, error: frontSignError }] = await Promise.all([
    supabase.storage.from(BOOTH_BUCKET).createSignedUrl(backPath, 3600),
    supabase.storage.from(BOOTH_BUCKET).createSignedUrl(frontPath, 3600),
  ]);
  if (backSignError || frontSignError || !backSigned?.signedUrl || !frontSigned?.signedUrl) {
    throw backSignError ?? frontSignError ?? new Error('OUR_ROOM_PLATE_URL_EMPTY');
  }
  return {
    type: 'image', presetId: `our-room-v1-pets-${input.includePets ? 'on' : 'off'}`,
    storagePath: backPath, url: backSigned.signedUrl, frontUrl: frontSigned.signedUrl,
    objectFit: 'cover', positionX: 0.5, positionY: 0.5,
  };
}

/** Remove a superseded session plate pair only; canonical Room media is never targeted. */
export async function removeSupersededBoothRoomPlates(input: {
  background: SameSpaceBackground | null | undefined;
  coupleId: string;
  sessionId: string;
}): Promise<void> {
  if (!isOurRoomBackground(input.background) || !input.background.storagePath) return;
  if (!backgroundPathBelongsToSession(input.background.storagePath, input.coupleId, input.sessionId)) return;
  const front = ourRoomFrontPlatePath(input.background);
  const paths = [input.background.storagePath, front].filter((path): path is string => Boolean(path));
  const { error } = await supabase.storage.from(BOOTH_BUCKET).remove(paths);
  if (error && import.meta.env.DEV) console.warn('[our-room-booth] superseded plate cleanup failed', error.message);
}
