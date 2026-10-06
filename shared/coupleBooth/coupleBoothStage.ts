/**
 * Canonical, renderer-agnostic Couple Booth stage contract.
 *
 * Coordinates are normalized against the external shot frame. Renderers are
 * responsible only for converting them to their current preview/export size.
 */

export type BoothStagePoint = { x: number; y: number };

export type BoothStageNormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BoothStageTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipX: boolean;
};

export type BoothStageAssetRef = {
  /** Stable adapter-owned identifier; the stage never interprets pet domains. */
  id: string;
  uri: string;
};

export type BoothCompanionSnapshot = {
  id: string;
  type?: string;
  displayName?: string;
  expression?: string;
  renderAsset: BoothStageAssetRef;
  transform: BoothStageTransform;
  zIndex: number;
};

export const BOOTH_STAGE_LAYER_ORDER = [
  'background',
  'participant',
  'companion',
  'foreground',
  'effect',
  'frame',
] as const;

export type BoothStageLayerKind = (typeof BOOTH_STAGE_LAYER_ORDER)[number];

export type BoothStageLayer = {
  id: string;
  kind: BoothStageLayerKind;
  zIndex?: number;
  participantId?: string;
  companion?: BoothCompanionSnapshot;
};

export type CoupleBoothStage = {
  coordinateSystem: 'normalized';
  widthAspect: number;
  heightAspect: number;
  layers: BoothStageLayer[];
};

export const DEFAULT_BOOTH_STAGE_TRANSFORM: BoothStageTransform = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  flipX: false,
};

export function stagePointToPixels(point: BoothStagePoint, width: number, height: number): BoothStagePoint {
  return { x: point.x * width, y: point.y * height };
}

export function stagePointFromPixels(point: BoothStagePoint, width: number, height: number): BoothStagePoint {
  return { x: point.x / Math.max(1, width), y: point.y / Math.max(1, height) };
}

export function stageRectToPixels(
  rect: BoothStageNormalizedRect,
  width: number,
  height: number,
): BoothStageNormalizedRect {
  return {
    x: rect.x * width,
    y: rect.y * height,
    width: rect.width * width,
    height: rect.height * height,
  };
}

export function stageRectFromPixels(
  rect: BoothStageNormalizedRect,
  width: number,
  height: number,
): BoothStageNormalizedRect {
  return {
    x: rect.x / Math.max(1, width),
    y: rect.y / Math.max(1, height),
    width: rect.width / Math.max(1, width),
    height: rect.height / Math.max(1, height),
  };
}

/** Stable ordering across live preview, review, editor, and export. */
export function orderCoupleBoothStageLayers(layers: readonly BoothStageLayer[]): BoothStageLayer[] {
  const rank = new Map<BoothStageLayerKind, number>(
    BOOTH_STAGE_LAYER_ORDER.map((kind, index) => [kind, index]),
  );
  return layers
    .map((layer, insertionIndex) => ({ layer, insertionIndex }))
    .sort((a, b) => {
      const kindDelta = (rank.get(a.layer.kind) ?? 0) - (rank.get(b.layer.kind) ?? 0);
      if (kindDelta !== 0) return kindDelta;
      const zDelta = (a.layer.zIndex ?? 0) - (b.layer.zIndex ?? 0);
      return zDelta !== 0 ? zDelta : a.insertionIndex - b.insertionIndex;
    })
    .map(({ layer }) => layer);
}

export function createCoupleBoothStage(layers: BoothStageLayer[] = []): CoupleBoothStage {
  return {
    coordinateSystem: 'normalized',
    widthAspect: 4,
    heightAspect: 3,
    layers: orderCoupleBoothStageLayers(layers),
  };
}

export function createParticipantStageLayers(
  participantIds: readonly string[],
  frontParticipantId?: string | null,
): BoothStageLayer[] {
  const backToFront = participantIds.filter((id) => id !== frontParticipantId);
  if (frontParticipantId && participantIds.includes(frontParticipantId)) {
    backToFront.push(frontParticipantId);
  }
  return orderCoupleBoothStageLayers(backToFront.map((participantId, zIndex) => ({
    id: `participant:${participantId}`,
    kind: 'participant' as const,
    participantId,
    zIndex,
  })));
}
