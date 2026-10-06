export const MAX_BOOTH_COMPANIONS = 4;

export type BoothCompanionPlacement = {
  petId: string;
  x: number;
  y: number;
  scale: number;
  flipX: boolean;
  zIndex: number;
};

export type BoothCompanionStateEvent = {
  type: 'companion_state_changed';
  sessionId: string;
  companions: BoothCompanionPlacement[];
  eventId: string;
  selectedBy: string;
  selectedAt: number;
  version: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeBoothCompanionPlacements(
  placements: BoothCompanionPlacement[],
): BoothCompanionPlacement[] {
  const seen = new Set<string>();
  return placements.flatMap((placement) => {
    if (!placement.petId || seen.has(placement.petId)) return [];
    seen.add(placement.petId);
    return [{
      petId: placement.petId,
      x: clamp(placement.x, 0.04, 0.96),
      y: clamp(placement.y, 0.5, 0.98),
      scale: clamp(placement.scale, 0.08, 0.35),
      flipX: Boolean(placement.flipX),
      zIndex: Math.round(clamp(placement.zIndex, -10, 10)),
    }];
  }).slice(0, MAX_BOOTH_COMPANIONS);
}

export function createBoothCompanionStateEvent(input: Omit<BoothCompanionStateEvent, 'type' | 'companions'> & {
  companions: BoothCompanionPlacement[];
}): BoothCompanionStateEvent {
  return { type: 'companion_state_changed', ...input, companions: normalizeBoothCompanionPlacements(input.companions) };
}

export function isNewerBoothCompanionStateEvent(
  incoming: BoothCompanionStateEvent,
  current: BoothCompanionStateEvent | null,
): boolean {
  if (!current) return true;
  if (incoming.sessionId !== current.sessionId) return false;
  if (incoming.eventId === current.eventId) return false;
  return incoming.version > current.version
    || (incoming.version === current.version && incoming.selectedAt > current.selectedAt)
    || (incoming.version === current.version && incoming.selectedAt === current.selectedAt && incoming.eventId > current.eventId);
}
