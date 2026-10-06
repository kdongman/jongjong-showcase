export type BoothMediaState =
  | 'permission-intro'
  | 'requesting-permission'
  | 'connecting-room'
  | 'publishing-media'
  | 'connected'
  | 'permission-denied'
  | 'device-not-found'
  | 'device-in-use'
  | 'unsupported'
  | 'publisher-connection-error'
  | 'participant-state-error'
  | 'connection-error';

export type BoothMediaErrorCode = Exclude<BoothMediaState, 'permission-intro' | 'requesting-permission' | 'connecting-room' | 'publishing-media' | 'connected'>;

export function classifyMediaError(error: unknown, phase?: string): BoothMediaErrorCode {
  const name = error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: unknown }).name)
    : '';

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (phase === 'participant-metadata-update') return 'participant-state-error';
  if (/publisher connection/i.test(message)) return 'publisher-connection-error';

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'device-not-found';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'device-in-use';
    default:
      return 'connection-error';
  }
}

export function mediaErrorCopy(code: BoothMediaErrorCode): string {
  if (code === 'publisher-connection-error') {
    return '카메라 전송 연결을 시작하지 못했습니다. 카메라와 마이크 권한을 확인한 뒤 다시 시도하세요.\n\nThe booth connected, but its camera transport could not start. Check camera and microphone access, then try again.';
  }
  if (code === 'participant-state-error') {
    return 'The booth camera connected, but participant state could not be initialized. Please try again.';
  }

  switch (code) {
    case 'permission-denied':
      return '카메라와 마이크 권한이 차단되어 있습니다. 주소창 왼쪽의 사이트 설정에서 카메라와 마이크를 허용한 뒤 다시 시도하세요.\n\nCamera and microphone access is blocked. Open the site settings from the address bar, allow camera and microphone access, then try again.';
    case 'device-not-found':
      return '사용 가능한 카메라 또는 마이크를 찾을 수 없습니다. 기기가 연결되어 있는지 확인한 뒤 다시 시도하세요.\n\nNo camera or microphone was found. Check that your device is connected, then try again.';
    case 'device-in-use':
      return '다른 앱에서 카메라 또는 마이크를 사용 중입니다. Zoom, Teams 또는 카메라 앱을 종료한 뒤 다시 시도하세요.\n\nAnother app is using your camera or microphone. Close Zoom, Teams, or the camera app, then try again.';
    case 'unsupported':
      return '이 브라우저에서는 카메라 연결을 사용할 수 없습니다. 최신 Chrome, Edge 또는 Safari에서 다시 열어주세요.\n\nThis browser cannot connect to your camera. Open Couple Booth in a current version of Chrome, Edge, or Safari.';
    default:
      return '촬영 공간에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.\n\nWe could not connect to the booth. Check your network and try again.';
  }
}
