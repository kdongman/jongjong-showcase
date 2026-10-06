/**
 * DEV-only structured diagnostics for Couple Booth join.
 * Never logs tokens, Authorization headers, or raw JWTs.
 */

export type BoothJoinPhase =
  | 'auth_ready'
  | 'membership_resolved'
  | 'session_found'
  | 'session_created'
  | 'session_join_selected'
  | 'token_request_started'
  | 'token_request_succeeded'
  | 'livekit_connect_started'
  | 'livekit_connected'
  | 'local_track_published'
  | 'remote_participant_detected'
  | 'remote_video_attached'
  | 'segmentation_ready'
  | 'join_failed';

export type BoothJoinLogFields = {
  phase: BoothJoinPhase;
  sessionIdPresent?: boolean;
  sessionKey?: string;
  isCreator?: boolean;
  browser?: string;
  httpStatus?: number;
  code?: string;
  message?: string;
  role?: 'host' | 'guest' | 'unknown';
};

function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)) return 'safari';
  if (/Edg/i.test(ua)) return 'edge';
  if (/Chrome/i.test(ua)) return 'chrome';
  if (/Firefox/i.test(ua)) return 'firefox';
  return 'other';
}

function sanitizeMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message
    .replace(/access_token=[^&\s]+/gi, 'access_token=<redacted>')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>')
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '<jwt>');
}

export function logBoothJoin(fields: BoothJoinLogFields): void {
  if (!import.meta.env.DEV) return;
  console.info('[couple-booth][join]', {
    ...fields,
    browser: fields.browser ?? detectBrowser(),
    message: sanitizeMessage(fields.message),
  });
}
