import type { BoothShotRow } from './types';

/** Explicit left/right (or host/guest) pair for one shot index — never inferred from array order. */
export type SameSpaceShotAssets = {
  shotIndex: number;
  captureId: string;
  hostShot: BoothShotRow;
  guestShot: BoothShotRow;
};

export type SameSpacePartialAssets = {
  shotIndex: number;
  captureId: string;
  leftShot?: BoothShotRow;
  rightShot?: BoothShotRow;
  /** Legacy aliases when slots map through host/guest ids. */
  hostShot?: BoothShotRow;
  guestShot?: BoothShotRow;
};

export type SameSpaceUrlKeys = {
  hostOriginalKey: string;
  guestOriginalKey: string;
  hostCutoutKey: string;
  guestCutoutKey: string;
};

/** Safe path fragment for logs — never the full signed URL. */
export function pathLogSuffix(path: string | null | undefined, keep = 48): string {
  if (!path) return '';
  return path.length <= keep ? path : path.slice(-keep);
}

export function sameSpaceUrlKeys(hostShotId: string, guestShotId: string): SameSpaceUrlKeys {
  return {
    hostOriginalKey: hostShotId,
    guestOriginalKey: guestShotId,
    hostCutoutKey: `${hostShotId}:cutout`,
    guestCutoutKey: `${guestShotId}:cutout`,
  };
}

export function cutoutUrlKey(shotId: string): string {
  return `${shotId}:cutout`;
}

/** Lookup by participant id only — never by array order. */
export function findParticipantShot(
  shots: BoothShotRow[],
  shotIndex: number,
  participantUserId: string,
): BoothShotRow | undefined {
  return shots.find((shot) => shot.shotIndex === shotIndex && shot.userId === participantUserId);
}

/**
 * Resolve host+guest shot rows by participant id and matching captureId.
 * Returns null when the pair is incomplete or maps the same participant twice.
 */
export function resolveSameSpaceShotAssets(
  shots: BoothShotRow[],
  shotIndex: number,
  hostUserId: string,
  guestUserId: string,
): SameSpaceShotAssets | null {
  if (!hostUserId || !guestUserId || hostUserId === guestUserId) return null;
  const hostShot = findParticipantShot(shots, shotIndex, hostUserId);
  const guestShot = findParticipantShot(shots, shotIndex, guestUserId);
  if (!hostShot || !guestShot) return null;
  if (hostShot.userId === guestShot.userId) return null;
  if (hostShot.imagePath === guestShot.imagePath) return null;
  if (hostShot.captureId !== guestShot.captureId) return null;
  if (hostShot.shotIndex !== guestShot.shotIndex) return null;
  return {
    shotIndex,
    captureId: hostShot.captureId,
    hostShot,
    guestShot,
  };
}

/**
 * Allow one-sided assets for solo / waiting-partner review without cloning
 * the present person into the empty slot.
 */
export function resolveSameSpaceAvailableAssets(
  shots: BoothShotRow[],
  shotIndex: number,
  leftUserId: string,
  rightUserId: string,
): SameSpacePartialAssets | null {
  if (!leftUserId || !rightUserId || leftUserId === rightUserId) return null;
  const leftShot = findParticipantShot(shots, shotIndex, leftUserId);
  const rightShot = findParticipantShot(shots, shotIndex, rightUserId);
  if (!leftShot && !rightShot) return null;
  if (leftShot && rightShot && leftShot.captureId !== rightShot.captureId) {
    // Prefer matching capture pairs; fall back to whatever is ready alone.
    if (leftShot.segmentationStatus === 'ready' && rightShot.segmentationStatus !== 'ready') {
      return { shotIndex, captureId: leftShot.captureId, leftShot, hostShot: leftShot };
    }
    if (rightShot.segmentationStatus === 'ready' && leftShot.segmentationStatus !== 'ready') {
      return { shotIndex, captureId: rightShot.captureId, rightShot, guestShot: rightShot };
    }
  }
  return {
    shotIndex,
    captureId: leftShot?.captureId ?? rightShot!.captureId,
    leftShot,
    rightShot,
    hostShot: leftShot,
    guestShot: rightShot,
  };
}

export function assertDistinctParticipantAssets(assets: SameSpaceShotAssets): boolean {
  return (
    assets.hostShot.userId !== assets.guestShot.userId
    && assets.hostShot.imagePath !== assets.guestShot.imagePath
    && assets.hostShot.shotIndex === assets.guestShot.shotIndex
    && assets.hostShot.captureId === assets.guestShot.captureId
  );
}

/** Full two-person Same Space when both cutouts are ready. */
export function canShowSameSpaceComposition(input: {
  sameSpaceEnabled: boolean;
  hostCutoutUrl?: string | null;
  guestCutoutUrl?: string | null;
  assets: SameSpaceShotAssets | null;
}): boolean {
  if (!input.sameSpaceEnabled || !input.assets) return false;
  if (!assertDistinctParticipantAssets(input.assets)) return false;
  return Boolean(input.hostCutoutUrl && input.guestCutoutUrl);
}

/**
 * Solo-safe Same Space: show whatever ready cutouts exist without inventing
 * a second person or cloning local into remote.
 */
export function canShowSameSpaceLayers(input: {
  sameSpaceEnabled: boolean;
  leftCutoutUrl?: string | null;
  rightCutoutUrl?: string | null;
}): boolean {
  if (!input.sameSpaceEnabled) return false;
  return Boolean(input.leftCutoutUrl || input.rightCutoutUrl);
}

/**
 * Strip partial cutout URL entries for incomplete two-person pairs so Review
 * does not render a one-sided broken composite as if both were ready.
 * Solo sessions (only one participant uploaded) keep their single cutout.
 */
export function applyAtomicSameSpaceCutoutFallback(
  urls: Record<string, string>,
  shots: BoothShotRow[],
  hostUserId: string,
  guestUserId: string,
): Record<string, string> {
  const next = { ...urls };
  const indexes = new Set(shots.map((shot) => shot.shotIndex));
  for (const shotIndex of indexes) {
    const hostShot = findParticipantShot(shots, shotIndex, hostUserId);
    const guestShot = findParticipantShot(shots, shotIndex, guestUserId);
    // Solo: only one participant has a shot for this index — keep their cutout.
    if (Boolean(hostShot) !== Boolean(guestShot)) continue;
    const assets = resolveSameSpaceShotAssets(shots, shotIndex, hostUserId, guestUserId);
    if (!assets) continue;
    const keys = sameSpaceUrlKeys(assets.hostShot.id, assets.guestShot.id);
    const hostCutout = next[keys.hostCutoutKey];
    const guestCutout = next[keys.guestCutoutKey];
    if (Boolean(hostCutout) !== Boolean(guestCutout)) {
      delete next[keys.hostCutoutKey];
      delete next[keys.guestCutoutKey];
    }
  }
  return next;
}

export function logSameSpaceAssetMapping(input: {
  sessionKey: string;
  shotIndex: number;
  assets: SameSpaceShotAssets | null;
  hostCutoutStatus?: string | null;
  guestCutoutStatus?: string | null;
  compositionRevision?: number | null;
}): void {
  const { assets } = input;
  console.info('[couple-booth][same-space-assets]', {
    sessionKey: input.sessionKey,
    shotId: assets ? `${assets.hostShot.id.slice(0, 8)}+${assets.guestShot.id.slice(0, 8)}` : null,
    shotIndex: input.shotIndex,
    hostRole: 'host',
    guestRole: 'guest',
    hostParticipantId: assets?.hostShot.userId ?? null,
    guestParticipantId: assets?.guestShot.userId ?? null,
    distinctParticipants: assets
      ? assets.hostShot.userId !== assets.guestShot.userId
      : false,
    hostAssetStatus: input.hostCutoutStatus ?? assets?.hostShot.segmentationStatus ?? null,
    guestAssetStatus: input.guestCutoutStatus ?? assets?.guestShot.segmentationStatus ?? null,
    hostPathSuffix: pathLogSuffix(assets?.hostShot.cutoutPath ?? assets?.hostShot.imagePath),
    guestPathSuffix: pathLogSuffix(assets?.guestShot.cutoutPath ?? assets?.guestShot.imagePath),
    captureIdPrefix: assets?.captureId ? assets.captureId.slice(0, 8) : null,
    compositionRevision: input.compositionRevision ?? null,
  });
}
