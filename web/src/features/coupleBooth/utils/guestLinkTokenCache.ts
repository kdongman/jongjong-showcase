import { isValidBoothSessionId } from '@shared/entry';

/**
 * Guest-link JWT must never be reused for couple-auth joins.
 * Only GuestBoothPage sets booth_guest_mode + booth_guest_livekit together.
 */
export function shouldUseGuestLinkTokenCache(sessionId: string, storage: Storage): boolean {
  if (!isValidBoothSessionId(sessionId)) return false;
  return storage.getItem(`booth_guest_mode:${sessionId}`) === '1';
}

export function readGuestLinkTokenCache(
  sessionId: string,
  storage: Storage,
): { token: string; url: string; roomName: string } | null {
  if (!shouldUseGuestLinkTokenCache(sessionId, storage)) return null;
  try {
    const cached = storage.getItem(`booth_guest_livekit:${sessionId}`);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as { token?: string; url?: string; roomName?: string };
    if (!parsed.token || !parsed.url || !parsed.roomName) return null;
    return { token: String(parsed.token), url: String(parsed.url), roomName: String(parsed.roomName) };
  } catch {
    return null;
  }
}

/** Clears guest-link LiveKit cache so couple-auth never reuses guest JWTs. */
export function clearGuestLinkTokenCache(sessionId: string, storage: Storage): void {
  if (!isValidBoothSessionId(sessionId)) return;
  storage.removeItem(`booth_guest_mode:${sessionId}`);
  storage.removeItem(`booth_guest_livekit:${sessionId}`);
}

/** Clears all booth guest caches (logout / auth user change). */
export function clearAllGuestLinkTokenCaches(storage: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && (key.startsWith('booth_guest_mode:') || key.startsWith('booth_guest_livekit:'))) {
      keys.push(key);
    }
  }
  for (const key of keys) storage.removeItem(key);
}
