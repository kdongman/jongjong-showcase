import type { BoothCompanionSnapshot, BoothStageAssetRef, BoothStageTransform } from './coupleBoothStage';

export type BoothCompanionReaction = 'idle' | 'attention' | 'shutter' | 'postCapture' | 'tap';

export type BoothCompanionReactionTransform = {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
};

export const BOOTH_COMPANION_REACTION_PRIORITY: Record<BoothCompanionReaction, number> = {
  idle: 0,
  attention: 1,
  tap: 2,
  postCapture: 3,
  shutter: 4,
};

const IDENTITY_REACTION: BoothCompanionReactionTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
};

/** Pure, stage-relative presentation delta. Values stay inside the Booth V1 motion envelope. */
export function boothCompanionReactionTransform(
  reaction: BoothCompanionReaction,
  anchorX = 0.5,
): BoothCompanionReactionTransform {
  const inwardRotation = anchorX < 0.5 ? 1 : anchorX > 0.5 ? -1 : 0;
  switch (reaction) {
    case 'attention':
      return { offsetX: 0, offsetY: -0.006, scale: 1.02, rotation: inwardRotation };
    case 'shutter':
      return { offsetX: 0, offsetY: -0.01, scale: 1.04, rotation: inwardRotation * 0.5 };
    case 'postCapture':
      return { offsetX: 0, offsetY: -0.003, scale: 0.99, rotation: 0 };
    case 'tap':
      return { offsetX: 0, offsetY: -0.007, scale: 1.03, rotation: inwardRotation };
    default:
      return IDENTITY_REACTION;
  }
}

export function resolveBoothCompanionReaction(
  reactions: readonly BoothCompanionReaction[],
): BoothCompanionReaction {
  return reactions.reduce<BoothCompanionReaction>(
    (winner, candidate) => BOOTH_COMPANION_REACTION_PRIORITY[candidate] > BOOTH_COMPANION_REACTION_PRIORITY[winner]
      ? candidate
      : winner,
    'idle',
  );
}

export function applyBoothCompanionReactionTransform(
  base: BoothStageTransform,
  reaction: BoothCompanionReaction,
): BoothStageTransform {
  const delta = boothCompanionReactionTransform(reaction, base.x);
  return {
    x: base.x + delta.offsetX,
    y: base.y + delta.offsetY,
    scale: base.scale * delta.scale,
    rotation: base.rotation + delta.rotation,
    flipX: base.flipX,
  };
}

/** Returns a presentation snapshot without ever mutating the persistent/base companion. */
export function resolveBoothCompanionPresentation(
  companion: BoothCompanionSnapshot,
  reaction: BoothCompanionReaction,
): BoothCompanionSnapshot {
  return {
    ...companion,
    renderAsset: { ...companion.renderAsset },
    transform: applyBoothCompanionReactionTransform(companion.transform, reaction),
  };
}

export function boothCompanionReactionForCountdown(countdown: number | null): BoothCompanionReaction {
  return countdown === 3 || countdown === 1 ? 'attention' : 'idle';
}

export const BOOTH_COMPANION_TAP_MOVEMENT_THRESHOLD_PX = 6;

export function isBoothCompanionTapGesture(deltaX: number, deltaY: number): boolean {
  return Math.hypot(deltaX, deltaY) < BOOTH_COMPANION_TAP_MOVEMENT_THRESHOLD_PX;
}

/** Capture-safe expression fallback: a missing/failed optional expression never blocks idle art. */
export function resolveBoothCompanionExpressionAsset(
  idle: BoothStageAssetRef,
  optionalExpression?: BoothStageAssetRef | null,
): BoothStageAssetRef {
  return optionalExpression ?? idle;
}
