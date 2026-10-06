import type { BoothSessionStatus } from './types';

const TRANSITIONS: Record<BoothSessionStatus, BoothSessionStatus[]> = {
  invited: ['accepted', 'declined', 'cancelled', 'expired'],
  accepted: ['connecting', 'cancelled', 'expired'],
  connecting: ['ready', 'cancelled', 'expired', 'failed'],
  ready: ['capturing', 'cancelled', 'expired', 'failed'],
  capturing: ['review', 'cancelled', 'expired', 'failed'],
  review: ['finalizing', 'cancelled', 'expired', 'failed'],
  finalizing: ['completed', 'review', 'failed', 'cancelled'],
  completed: [],
  declined: [],
  cancelled: [],
  expired: [],
  failed: ['cancelled'],
};

export function canTransition(from: BoothSessionStatus, to: BoothSessionStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: BoothSessionStatus, to: BoothSessionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_BOOTH_TRANSITION:${from}->${to}`);
  }
}

export function isTerminalStatus(status: BoothSessionStatus): boolean {
  return ['completed', 'declined', 'cancelled', 'expired', 'failed'].includes(status);
}

export function isMediaActiveStatus(status: BoothSessionStatus): boolean {
  return ['accepted', 'connecting', 'ready', 'capturing'].includes(status);
}

export function canIssueLiveKitToken(status: BoothSessionStatus): boolean {
  return ['accepted', 'connecting', 'ready', 'capturing'].includes(status);
}

export function canEnterReview(status: BoothSessionStatus): boolean {
  return status === 'capturing' || status === 'review';
}
