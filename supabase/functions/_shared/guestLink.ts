/** Shared guest-link helpers for Couple Booth Edge Functions. */

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

/** 32-byte crypto-secure token; never log the raw value. */
export function mintGuestLinkToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function tokenFingerprint(rawToken: string): string {
  return `${rawToken.slice(0, 4)}…${rawToken.slice(-4)}`;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseInternalTesterAllowList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => isUuid(value)),
  );
}

export async function isInternalBoothTester(
  admin: { from: (table: string) => any },
  userId: string,
): Promise<boolean> {
  const allow = parseInternalTesterAllowList(Deno.env.get('BOOTH_INTERNAL_TESTER_USER_IDS'));
  if (allow.has(userId)) return true;
  const { data, error } = await admin.from('profiles').select('is_internal_tester').eq('id', userId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.is_internal_tester);
}

export const GUEST_LINK_TTL_MS = 10 * 60 * 1000;
export const ACTIVE_SESSION_STATUSES = new Set([
  'invited',
  'accepted',
  'connecting',
  'ready',
  'capturing',
]);
