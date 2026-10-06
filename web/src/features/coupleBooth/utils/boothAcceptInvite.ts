import type { BoothSession } from '@shared/types';
import { isValidBoothSessionId } from '@shared/entry';

let inflightAccept: { sessionId: string; promise: Promise<BoothSession> } | null = null;

/**
 * Guest invite accept — StrictMode remounts share one in-flight RPC.
 * Success is applied by callers even after an effect cleanup.
 */
export function beginAcceptBoothInviteSingleFlight(
  sessionId: string,
  accept: (sessionId: string) => Promise<BoothSession>,
): Promise<BoothSession> {
  if (!isValidBoothSessionId(sessionId)) {
    return Promise.reject(new Error('INVALID_BOOTH_SESSION_ID'));
  }
  if (inflightAccept?.sessionId === sessionId) {
    return inflightAccept.promise;
  }
  const promise = accept(sessionId).finally(() => {
    if (inflightAccept?.promise === promise) {
      inflightAccept = null;
    }
  });
  inflightAccept = { sessionId, promise };
  return promise;
}

export function resetAcceptBoothInviteSingleFlightForTests(): void {
  inflightAccept = null;
}
