export type BoothCameraFacing = 'user' | 'environment' | 'unknown';

export type BoothParticipantVisual = {
  mirrorX: boolean;
  cameraFacing: BoothCameraFacing;
  mirrorMode?: 'auto' | 'manual';
  scale: number;
  offsetX: number;
  offsetY: number;
};

/** The deterministic composition shown on every client: host left, guest right. */
export type BoothSharedStage = {
  layout: 'side-by-side';
  leftParticipantId: string;
  rightParticipantId: string;
  participants: Record<string, BoothParticipantVisual>;
  revision: number;
};

export const DEFAULT_BOOTH_PARTICIPANT_VISUAL: BoothParticipantVisual = {
  mirrorX: true,
  cameraFacing: 'unknown',
  mirrorMode: 'auto',
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export function createBoothSharedStage(
  hostUserId: string,
  guestUserId: string,
  visuals: Partial<Record<string, Partial<BoothParticipantVisual>>> = {},
  revision = 1,
): BoothSharedStage {
  return {
    layout: 'side-by-side',
    leftParticipantId: hostUserId,
    rightParticipantId: guestUserId,
    participants: {
      [hostUserId]: { ...DEFAULT_BOOTH_PARTICIPANT_VISUAL, ...visuals[hostUserId] },
      [guestUserId]: { ...DEFAULT_BOOTH_PARTICIPANT_VISUAL, ...visuals[guestUserId] },
    },
    revision,
  };
}

/** Safely resolve a participant's metadata without ever role-based fallback. */
export function resolveBoothParticipantVisual(metadata: unknown): BoothParticipantVisual {
  const value = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
  const cameraFacing: BoothCameraFacing =
    value.cameraFacing === 'user' || value.cameraFacing === 'environment'
      ? value.cameraFacing
      : 'unknown';
  const mirrorX = value.mirrorX !== false
    || (cameraFacing !== 'environment' && value.mirrorMode !== 'manual');
  return {
    ...DEFAULT_BOOTH_PARTICIPANT_VISUAL,
    mirrorX,
    cameraFacing,
  };
}
