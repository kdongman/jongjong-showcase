import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearGuestLinkTokenCache, readGuestLinkTokenCache, shouldUseGuestLinkTokenCache } from './guestLinkTokenCache';

function memoryStorage(data: Record<string, string> = {}): Storage {
  return {
    data,
    getItem(key: string) { return this.data[key] ?? null; },
    setItem(key: string, value: string) { this.data[key] = value; },
    removeItem(key: string) { delete this.data[key]; },
    clear() { this.data = {}; },
    key() { return null; },
    get length() { return Object.keys(this.data).length; },
  } as Storage & { data: Record<string, string> };
}

describe('guest link token cache isolation', () => {
  const sessionId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  it('ignores guest-link cache for couple-auth joins', () => {
    const storage = memoryStorage({
      [`booth_guest_livekit:${sessionId}`]: JSON.stringify({
        token: 'guest-jwt',
        url: 'wss://livekit.example',
        roomName: 'booth_x',
      }),
    });
    assert.equal(shouldUseGuestLinkTokenCache(sessionId, storage), false);
    assert.equal(readGuestLinkTokenCache(sessionId, storage), null);
  });

  it('uses guest-link cache only when guest mode flag is set', () => {
    const storage = memoryStorage({
      [`booth_guest_mode:${sessionId}`]: '1',
      [`booth_guest_livekit:${sessionId}`]: JSON.stringify({
        token: 'guest-jwt',
        url: 'wss://livekit.example',
        roomName: 'booth_x',
      }),
    });
    const cached = readGuestLinkTokenCache(sessionId, storage);
    assert.ok(cached);
    assert.equal(cached?.roomName, 'booth_x');
  });

  it('clears guest cache so couple-auth cannot reuse it', () => {
    const storage = memoryStorage({
      [`booth_guest_mode:${sessionId}`]: '1',
      [`booth_guest_livekit:${sessionId}`]: JSON.stringify({
        token: 'guest-jwt',
        url: 'wss://livekit.example',
        roomName: 'booth_x',
      }),
    });
    clearGuestLinkTokenCache(sessionId, storage);
    assert.equal(shouldUseGuestLinkTokenCache(sessionId, storage), false);
    assert.equal(readGuestLinkTokenCache(sessionId, storage), null);
  });

  it('rejects null session ids before cache or token requests', () => {
    const storage = memoryStorage();
    assert.equal(shouldUseGuestLinkTokenCache('null', storage), false);
    assert.equal(shouldUseGuestLinkTokenCache(undefined as unknown as string, storage), false);
  });
});
