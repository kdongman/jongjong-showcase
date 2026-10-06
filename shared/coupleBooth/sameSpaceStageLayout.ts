import {
  DEFAULT_SAME_SPACE_BACKGROUND,
  type SameSpaceBackground,
} from './sameSpaceBackground';

/** Normalized 0–1 stage coordinates — display-only until composition sync lands. */
export type SameSpaceNormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SameSpaceStageTemplateId = 'classic-pair';

export type SameSpaceStageLayout = {
  template: SameSpaceStageTemplateId;
  /** @deprecated Prefer SameSpaceBackground descriptor in the canvas renderer. */
  background: string;
  /** Left home half (0–50%). */
  host: SameSpaceNormalizedRect;
  /** Right home half (50–100%). */
  guest: SameSpaceNormalizedRect;
  left: SameSpaceNormalizedRect;
  right: SameSpaceNormalizedRect;
  safeArea: SameSpaceNormalizedRect;
};

/** Safe-area + 50:50 home regions. Live stage composites independent layers. */
export function computeSameSpaceStageLayout(
  template: SameSpaceStageTemplateId = 'classic-pair',
): SameSpaceStageLayout {
  void template;
  const left = { x: 0, y: 0, width: 0.5, height: 1 };
  const right = { x: 0.5, y: 0, width: 0.5, height: 1 };
  return {
    template: 'classic-pair',
    background: DEFAULT_SAME_SPACE_BACKGROUND.type === 'solid'
      ? DEFAULT_SAME_SPACE_BACKGROUND.color
      : '#EDE4F7',
    host: left,
    guest: right,
    left,
    right,
    safeArea: { x: 0.04, y: 0.04, width: 0.92, height: 0.92 },
  };
}

function percent(value: number): string {
  return `${Number((value * 100).toFixed(4))}%`;
}

export function sameSpaceRectStyle(rect: SameSpaceNormalizedRect): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: percent(rect.x),
    top: percent(rect.y),
    width: percent(rect.width),
    height: percent(rect.height),
  };
}

export function partnerUserIdForLocal(
  localUserId: string,
  hostUserId: string,
  guestUserId: string,
): string | null {
  if (localUserId === hostUserId) return guestUserId;
  if (localUserId === guestUserId) return hostUserId;
  return null;
}

/**
 * @deprecated Session host/guest is a media role, not a composition slot.
 * Prefer compositionSlotForUserId from sameSpaceLayoutSpec.
 */
export function roleForUserId(
  userId: string,
  hostUserId: string,
  guestUserId: string,
): 'host' | 'guest' | null {
  if (userId === hostUserId) return 'host';
  if (userId === guestUserId) return 'guest';
  return null;
}

export function isSameSpaceBackgroundCompat(value: unknown): value is SameSpaceBackground {
  return Boolean(value && typeof value === 'object');
}
