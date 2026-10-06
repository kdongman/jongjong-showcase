/** Friendly bilingual camera error messages for getUserMedia / LiveKit publish failures. */
export function formatCameraError(error: unknown): string {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name)
      : '';
  const message = error instanceof Error ? error.message : String(error ?? 'CAMERA_ERROR');

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return [
        '카메라 권한이 거부되었습니다. 브라우저 주소창의 카메라 권한을 허용한 뒤 다시 시도하세요.',
        'Camera permission denied. Allow camera access in the browser address bar, then try again.',
      ].join('\n');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return [
        '사용 가능한 카메라를 찾지 못했습니다. 웹캠이 연결되어 있는지 확인하세요.',
        'No camera was found. Check that a webcam is connected.',
      ].join('\n');
    case 'NotReadableError':
    case 'TrackStartError':
      return [
        '카메라를 열 수 없습니다. Zoom, Teams, Meet 등 다른 화상 앱이 카메라를 점유하고 있을 수 있습니다. 해당 앱을 종료한 뒤 다시 시도하세요.',
        'Could not open the camera. Another video app (Zoom, Teams, Meet, etc.) may be holding it. Close that app and try again.',
      ].join('\n');
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return [
        '요청한 카메라 설정을 지원하지 않습니다. 다른 카메라를 선택하거나 기본 해상도로 다시 시도하세요.',
        'The requested camera constraints are not supported. Pick another camera or retry with defaults.',
      ].join('\n');
    default:
      if (/not allowed|permission/i.test(message)) {
        return formatCameraError({ name: 'NotAllowedError', message });
      }
      if (/not readable|could not start|in use|busy/i.test(message)) {
        return formatCameraError({ name: 'NotReadableError', message });
      }
      return message;
  }
}
