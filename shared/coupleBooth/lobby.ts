import type { BoothSession } from './types';

export type BoothLobbyView =
  | 'create'
  | 'host_waiting'
  | 'guest_invite'
  | 'resume';

export function resolveBoothLobbyView(
  session: BoothSession | null,
  userId: string,
): BoothLobbyView {
  if (!session) return 'create';
  if (session.hostUserId === userId) return 'host_waiting';
  if (session.guestUserId === userId && session.status === 'invited') return 'guest_invite';
  return 'resume';
}

export function canInitializeLocalMedia(input: {
  roomConnected: boolean;
  userPressedPrepare: boolean;
  localMediaReady: boolean;
}): boolean {
  return input.roomConnected && input.userPressedPrepare && !input.localMediaReady;
}

export function canShowBoothCameraStage(input: {
  status: BoothSession['status'];
  mediaConnectionActive: boolean;
  localMediaReady: boolean;
  remoteMediaReady: boolean;
}): boolean {
  return (
    input.status !== 'invited'
    && ['accepted', 'connecting', 'ready', 'capturing'].includes(input.status)
    && input.mediaConnectionActive
    && input.localMediaReady
    && input.remoteMediaReady
  );
}

export function resolveBoothReadyCta(localReady: boolean, remoteReady: boolean): string {
  if (localReady) return '나는 준비됐어요';
  if (remoteReady) return '나도 준비하기';
  return '촬영 준비하기';
}
