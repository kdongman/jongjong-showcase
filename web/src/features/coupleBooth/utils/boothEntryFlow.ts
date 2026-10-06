import type { BoothSession } from '@shared/types';
import { isValidBoothSessionId } from '@shared/entry';

export function boothHomeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  if (lower.includes('couple_required') || lower.includes('not_couple_member')) {
    return '연결된 파트너가 없습니다. 앱에서 먼저 파트너와 연결해 주세요.';
  }
  if (lower.includes('partner_required')) {
    return '파트너가 아직 연결되지 않았습니다. 앱에서 연결을 완료해 주세요.';
  }
  if (lower.includes('not_authenticated') || lower.includes('jwt')) {
    return '로그인이 필요합니다. 다시 로그인해 주세요.';
  }
  if (lower.includes('only_guest_can_accept')) {
    return '상대방의 초대를 수락하는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (lower.includes('not_session_participant') || lower.includes('session_seat')) {
    return '이 촬영실에 참가할 권한이 없습니다. 같은 커플 계정으로 로그인해 주세요.';
  }
  return '촬영실을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export type BoothEntryResult =
  | { kind: 'ready'; session: BoothSession; created: boolean }
  | { kind: 'needs_couple' }
  | { kind: 'error'; message: string; code?: string };

type ResolveBoothEntryOptions = {
  userId: string;
  coupleId: string | null | undefined;
  refreshProfile: () => Promise<{ coupleId: string | null } | null>;
  /** Participant-scoped read — prefer join over create. */
  getActiveSession: () => Promise<BoothSession | null>;
  getOrCreateSession: () => Promise<BoothSession>;
  acceptInvite: (sessionId: string) => Promise<BoothSession>;
  notifyHostInvite?: (sessionId: string) => Promise<unknown>;
};

export function isBoothSessionParticipant(session: BoothSession, userId: string): boolean {
  return session.hostUserId === userId || session.guestUserId === userId;
}

/**
 * Join existing couple booth when present; create only when none exists.
 * Never creates a second session because a join/accept/token step failed.
 */
export async function resolveBoothEntrySession(
  options: ResolveBoothEntryOptions,
): Promise<BoothEntryResult> {
  let coupleId = options.coupleId ?? null;
  if (!coupleId) {
    const latest = await options.refreshProfile();
    coupleId = latest?.coupleId ?? null;
  }
  if (!coupleId) {
    return { kind: 'needs_couple' };
  }

  try {
    let created = false;
    let session = await options.getActiveSession();
    if (session && isValidBoothSessionId(session.id)) {
      // Prefer joining the participant-scoped active session.
    } else {
      session = await options.getOrCreateSession();
      created = true;
    }

    if (!isValidBoothSessionId(session?.id)) {
      return {
        kind: 'error',
        message: '촬영방 정보가 올바르지 않습니다. 다시 시도해 주세요.',
        code: 'INVALID_SESSION_ID',
      };
    }

    if (!isBoothSessionParticipant(session, options.userId)) {
      return {
        kind: 'error',
        message: '이 촬영실에 참가할 권한이 없습니다. 같은 커플 계정으로 로그인해 주세요.',
        code: 'NOT_SESSION_PARTICIPANT',
      };
    }

    // Guest must accept invited sessions before LiveKit tokens are eligible.
    if (session.guestUserId === options.userId && session.status === 'invited') {
      try {
        session = await options.acceptInvite(session.id);
      } catch (error) {
        // Do not create a replacement session on accept failure.
        return {
          kind: 'error',
          message: boothHomeErrorMessage(error),
          code: 'ACCEPT_FAILED',
        };
      }
      if (!isValidBoothSessionId(session?.id) || !isBoothSessionParticipant(session, options.userId)) {
        return {
          kind: 'error',
          message: '초대를 수락하지 못했습니다. 다시 시도해 주세요.',
          code: 'ACCEPT_FAILED',
        };
      }
    }

    if (session.hostUserId === options.userId && isValidBoothSessionId(session.id)) {
      void options.notifyHostInvite?.(session.id).catch(() => {
        console.warn('[couple-booth] invite notification request failed');
      });
    }

    return { kind: 'ready', session, created };
  } catch (error) {
    return { kind: 'error', message: boothHomeErrorMessage(error) };
  }
}

/** Module-level single-flight so React StrictMode remounts share one entry attempt. */
let inflightEntry: { userId: string; promise: Promise<BoothEntryResult> } | null = null;

export function beginBoothEntrySingleFlight(
  userId: string,
  run: () => Promise<BoothEntryResult>,
): Promise<BoothEntryResult> {
  if (inflightEntry?.userId === userId) {
    return inflightEntry.promise;
  }
  const promise = run().finally(() => {
    if (inflightEntry?.promise === promise) {
      inflightEntry = null;
    }
  });
  inflightEntry = { userId, promise };
  return promise;
}

/** Test helper — clears module single-flight between cases. */
export function resetBoothEntrySingleFlightForTests(): void {
  inflightEntry = null;
}
