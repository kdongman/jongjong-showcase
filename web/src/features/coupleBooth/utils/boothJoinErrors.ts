import { BoothTokenError, type BoothTokenErrorCode } from '@shared/tokenError';
import type { BoothMediaErrorCode, BoothMediaState } from '../media/mediaConnectionState';
import { isBoothMediaErrorState } from './boothStageConnection';

export type BoothJoinFailureKind =
  | 'permission'
  | 'auth_required'
  | 'session_forbidden'
  | 'session_ended'
  | 'connection_interrupted'
  | 'token_failed'
  | 'room_failed'
  | 'playback_restricted'
  | 'segmentation_only'
  | 'generic';

export function classifyBoothJoinFailure(input: {
  mediaState?: BoothMediaState;
  mediaErrorCode?: BoothMediaErrorCode | null;
  pageError?: string | null;
  tokenError?: BoothTokenError | null;
}): { kind: BoothJoinFailureKind; title: string; detail: string } {
  const tokenCode = input.tokenError?.code;
  const mediaCode = input.mediaErrorCode
    ?? (input.mediaState && isBoothMediaErrorState(input.mediaState) ? input.mediaState : null);
  const page = (input.pageError ?? '').toLowerCase();

  if (mediaCode === 'permission-denied') {
    return {
      kind: 'permission',
      title: '카메라 권한이 필요해요',
      detail: '주소창 왼쪽 사이트 설정에서 카메라와 마이크를 허용한 뒤 다시 시도해 주세요.',
    };
  }
  if (
    tokenCode === 'AUTH_SESSION_MISSING'
    || tokenCode === 'AUTH_TOKEN_EXPIRED'
    || tokenCode === 'AUTH_TOKEN_INVALID'
    || tokenCode === 'AUTH_USER_MISMATCH'
    || tokenCode === 'UNAUTHORIZED'
    || page.includes('auth_session')
    || page.includes('로그인 정보가 만료')
  ) {
    return {
      kind: 'auth_required',
      title: '로그인 정보가 만료되었어요',
      detail: '다시 로그인해 주세요.',
    };
  }
  if (
    page.includes('capture_schedule_missed')
    || page.includes('capture_schedule_failed')
    || page.includes('capture_ack_timeout')
    || page.includes('partner_capture_late')
    || page.includes('clock_sync')
  ) {
    return {
      kind: 'generic',
      title: '촬영 타이밍을 맞추지 못했어요',
      detail: '다시 촬영해 주세요. 카메라 연결은 그대로 유지됩니다.',
    };
  }
  if (tokenCode === 'NOT_SESSION_PARTICIPANT' || page.includes('not_session_participant') || page.includes('참가할 권한')) {
    return {
      kind: 'session_forbidden',
      title: '이 촬영방에 참여할 권한이 없어요',
      detail: '같은 커플로 연결된 계정인지 확인해 주세요.',
    };
  }
  if (
    tokenCode === 'SESSION_EXPIRED'
    || tokenCode === 'MEDIA_EXPIRED'
    || page.includes('expired')
    || page.includes('종료')
  ) {
    return {
      kind: 'session_ended',
      title: '촬영실이 종료됐어요',
      detail: '상대와 다시 만나려면 홈에서 새로 준비해 주세요.',
    };
  }
  if (tokenCode === 'SESSION_NOT_MEDIA_ELIGIBLE') {
    return {
      kind: 'connection_interrupted',
      title: '상대 연결을 준비하고 있어요',
      detail: '잠시 후 다시 시도해 주세요.',
    };
  }
  if (
    tokenCode === 'TOKEN_CONFIG_ERROR'
    || tokenCode === 'LIVEKIT_CONFIG_MISSING'
    || tokenCode === 'SESSION_ROOM_MISSING'
    || tokenCode === 'LIVEKIT_ROOM_NAME_INVALID'
    || tokenCode === 'LIVEKIT_IDENTITY_INVALID'
    || tokenCode === 'TOKEN_ISSUANCE_FAILED'
    || (input.tokenError && input.tokenError.status >= 500)
  ) {
    return {
      kind: 'token_failed',
      title: '촬영 연결을 준비하지 못했어요',
      detail: '잠시 후 다시 시도해 주세요.',
    };
  }
  if (tokenCode && tokenCode !== 'UNKNOWN') {
    return {
      kind: 'token_failed',
      title: '촬영 연결을 준비하지 못했어요',
      detail: '잠시 후 다시 시도해 주세요.',
    };
  }
  if (mediaCode === 'connection-error' || mediaCode === 'publisher-connection-error') {
    return {
      kind: 'room_failed',
      title: '네트워크 연결을 확인해 주세요',
      detail: '잠시 후 다시 시도해 주세요. 기존 촬영실은 유지됩니다.',
    };
  }
  if (mediaCode === 'unsupported' || page.includes('autoplay') || page.includes('playback')) {
    return {
      kind: 'playback_restricted',
      title: '브라우저가 영상 재생을 제한했어요',
      detail: '화면을 한 번 탭한 뒤 다시 시도해 주세요. 연결은 유지됩니다.',
    };
  }
  if (page.includes('segment')) {
    return {
      kind: 'segmentation_only',
      title: '배경 효과만 준비되지 않았어요',
      detail: '일반 분할 화면으로 촬영을 계속할 수 있어요.',
    };
  }
  return {
    kind: 'generic',
    title: '촬영 준비 중 문제가 생겼어요',
    detail: input.pageError || '잠시 후 다시 시도해 주세요.',
  };
}

export function tokenErrorFromUnknown(error: unknown): BoothTokenError | null {
  return error instanceof BoothTokenError ? error : null;
}

export function isTokenErrorCode(code: string): code is BoothTokenErrorCode {
  return [
    'INVALID_SESSION_ID',
    'UNAUTHORIZED',
    'AUTH_SESSION_MISSING',
    'AUTH_TOKEN_EXPIRED',
    'AUTH_TOKEN_INVALID',
    'AUTH_USER_MISMATCH',
    'SESSION_NOT_FOUND',
    'NOT_SESSION_PARTICIPANT',
    'SESSION_EXPIRED',
    'MEDIA_EXPIRED',
    'SESSION_NOT_MEDIA_ELIGIBLE',
    'SESSION_ROOM_MISSING',
    'LIVEKIT_CONFIG_MISSING',
    'LIVEKIT_ROOM_NAME_INVALID',
    'LIVEKIT_IDENTITY_INVALID',
    'TOKEN_CONFIG_ERROR',
    'TOKEN_ISSUANCE_FAILED',
    'UNKNOWN',
  ].includes(code);
}
