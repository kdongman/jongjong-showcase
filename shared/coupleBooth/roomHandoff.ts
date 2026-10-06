import type { BoothSession, BoothShotRow } from './types';

/** Only durable, selected, full-resolution originals are eligible after completion. */
export function eligibleBoothRoomShotSources(
  session: Pick<BoothSession, 'id' | 'status' | 'selectedShotIndexes'>,
  shots: readonly BoothShotRow[],
): BoothShotRow[] {
  if (session.status !== 'completed') return [];
  const order = new Map(session.selectedShotIndexes.map((index, position) => [index, position]));
  return shots
    .filter((shot) => shot.sessionId === session.id && order.has(shot.shotIndex) && Boolean(shot.id && shot.imagePath))
    .sort((left, right) => {
      const bySelection = (order.get(left.shotIndex) ?? 99) - (order.get(right.shotIndex) ?? 99);
      if (bySelection !== 0) return bySelection;
      return left.userId.localeCompare(right.userId);
    });
}

export function canOfferFinalBoothRoomSource(
  session: Pick<BoothSession, 'status' | 'finalImagePath'>,
): boolean {
  return session.status === 'completed' && Boolean(session.finalImagePath);
}
