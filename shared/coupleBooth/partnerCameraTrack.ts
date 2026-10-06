/**
 * Pure helpers for validating partner camera tracks.
 * LiveKit Source.Camera === 'camera', Kind.Video === 'video'.
 */
export type PartnerTrackCandidate = {
  expectedParticipantId: string;
  participantIdentity: string;
  source: string;
  kind: string;
  isLocal?: boolean;
};

export function isPartnerCameraTrack(candidate: PartnerTrackCandidate): boolean {
  if (!candidate.expectedParticipantId) return false;
  if (candidate.isLocal) return false;
  if (candidate.participantIdentity !== candidate.expectedParticipantId) return false;
  if (candidate.source !== 'camera') return false;
  if (candidate.kind !== 'video') return false;
  return true;
}

export function shouldIgnoreTrack(candidate: PartnerTrackCandidate): boolean {
  return !isPartnerCameraTrack(candidate);
}
