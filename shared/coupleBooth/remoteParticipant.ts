/**
 * Resolve the Couple Booth partner remote participant by explicit identity.
 * Never falls back to "first remote in the room map".
 */
export function resolveBoothRemoteParticipant<T extends { identity: string }>(
  remoteParticipants: Iterable<T>,
  expectedPartnerIdentity: string | null | undefined,
): T | null {
  if (!expectedPartnerIdentity) return null;
  for (const participant of remoteParticipants) {
    if (participant.identity === expectedPartnerIdentity) return participant;
  }
  return null;
}
