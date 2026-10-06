import type { BoothSessionStatus } from '@shared/types';
import type { BoothMediaState } from '../media/mediaConnectionState';

export type BoothStageConnectionUx =
  | 'preparing'
  | 'waiting_partner'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type BoothStageConnectionInput = {
  sessionStatus: BoothSessionStatus;
  mediaState: BoothMediaState;
  livekitConnection: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  remoteConnected: boolean;
  /** Local getUserMedia preview while session is still invited (host waiting). */
  localPreviewReady?: boolean;
};

const MEDIA_ERROR_STATES: ReadonlySet<BoothMediaState> = new Set([
  'permission-denied',
  'device-not-found',
  'device-in-use',
  'unsupported',
  'publisher-connection-error',
  'participant-state-error',
  'connection-error',
]);

export function isBoothMediaErrorState(state: BoothMediaState): boolean {
  return MEDIA_ERROR_STATES.has(state);
}

export function resolveBoothStageConnectionUx(
  input: BoothStageConnectionInput,
): BoothStageConnectionUx {
  if (isBoothMediaErrorState(input.mediaState)) {
    return 'error';
  }
  if (input.livekitConnection === 'reconnecting') {
    return 'reconnecting';
  }

  const localReady =
    input.mediaState === 'connected'
    || input.mediaState === 'publishing-media'
    || Boolean(input.localPreviewReady);

  if (localReady && input.remoteConnected && input.mediaState === 'connected') {
    return 'connected';
  }
  if (localReady && !input.remoteConnected) {
    return 'waiting_partner';
  }
  return 'preparing';
}

export function boothStageConnectionCopy(ux: BoothStageConnectionUx): {
  title: string;
  detail: string | null;
} {
  switch (ux) {
    case 'preparing':
      return { title: '촬영 준비 중…', detail: null };
    case 'waiting_partner':
      return {
        title: '상대를 기다리고 있어요',
        detail: '상대가 들어오면 바로 함께 보여요.',
      };
    case 'connected':
      return { title: '함께 연결됐어요', detail: null };
    case 'reconnecting':
      return { title: '연결을 복구하는 중…', detail: null };
    case 'error':
      return { title: '연결에 문제가 있어요', detail: null };
  }
}
