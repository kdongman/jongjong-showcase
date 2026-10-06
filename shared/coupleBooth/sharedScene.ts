import {
  stageRectToPixels,
  type BoothStageNormalizedRect,
  type BoothStagePoint,
} from './coupleBoothStage';

export const BOOTH_SHARED_SCENE_IDS = ['classic', 'photo-studio', 'cozy-room', 'night-booth'] as const;
export type BoothSharedSceneId = (typeof BOOTH_SHARED_SCENE_IDS)[number];

export type BoothSharedScenePaint =
  | {
      kind: 'rect';
      rect: BoothStageNormalizedRect;
      fill: string;
      opacity?: number;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      kind: 'ellipse';
      center: BoothStagePoint;
      radiusX: number;
      radiusY: number;
      fill: string;
      opacity?: number;
      stroke?: string;
      strokeWidth?: number;
    }
  | {
      kind: 'line';
      from: BoothStagePoint;
      to: BoothStagePoint;
      stroke: string;
      strokeWidth: number;
      opacity?: number;
    }
  | {
      kind: 'linear-gradient';
      rect: BoothStageNormalizedRect;
      from: BoothStagePoint;
      to: BoothStagePoint;
      stops: readonly { offset: number; color: string }[];
      opacity?: number;
    }
  | {
      kind: 'radial-gradient';
      rect: BoothStageNormalizedRect;
      center: BoothStagePoint;
      innerRadius: number;
      outerRadius: number;
      stops: readonly { offset: number; color: string }[];
      opacity?: number;
    };

export type BoothSharedSceneDefinition = {
  id: BoothSharedSceneId;
  displayName: string;
  compactLabel: string;
  /** Classic delegates to the existing Same Space background renderer unchanged. */
  useExistingBackground: boolean;
  backgroundColor?: string;
  backgroundDecoration: readonly BoothSharedScenePaint[];
  foregroundElements: readonly BoothSharedScenePaint[];
  safeRegion: BoothStageNormalizedRect;
  grounding?: {
    floorBoundaryY: number;
    baselineRegion: BoothStageNormalizedRect;
    treatment: 'floor-only';
  };
  previewEligible: boolean;
  exportEligible: boolean;
};

const FULL_STAGE: BoothStageNormalizedRect = { x: 0, y: 0, width: 1, height: 1 };
const PARTICIPANT_SAFE_REGION: BoothStageNormalizedRect = { x: 0.19, y: 0.08, width: 0.62, height: 0.78 };

export const BOOTH_SHARED_SCENE_DEFINITIONS: readonly BoothSharedSceneDefinition[] = [
  {
    id: 'classic',
    displayName: 'Classic',
    compactLabel: 'Classic',
    useExistingBackground: true,
    backgroundDecoration: [],
    foregroundElements: [],
    safeRegion: FULL_STAGE,
    previewEligible: true,
    exportEligible: true,
  },
  {
    id: 'photo-studio',
    displayName: 'Photo Studio',
    compactLabel: 'Studio',
    useExistingBackground: false,
    backgroundColor: '#EEE5DB',
    backgroundDecoration: [
      {
        kind: 'radial-gradient',
        rect: FULL_STAGE,
        center: { x: 0.5, y: 0.36 },
        innerRadius: 0.04,
        outerRadius: 0.68,
        stops: [
          { offset: 0, color: 'rgba(255,255,255,0.70)' },
          { offset: 1, color: 'rgba(221,207,193,0.10)' },
        ],
      },
      {
        kind: 'linear-gradient',
        rect: { x: 0, y: 0.7, width: 1, height: 0.3 },
        from: { x: 0.5, y: 0.7 },
        to: { x: 0.5, y: 1 },
        stops: [
          { offset: 0, color: '#DFD1C2' },
          { offset: 1, color: '#C8B5A4' },
        ],
      },
      { kind: 'line', from: { x: 0, y: 0.7 }, to: { x: 1, y: 0.7 }, stroke: '#C4AF9B', strokeWidth: 0.003, opacity: 0.72 },
    ],
    foregroundElements: [],
    safeRegion: PARTICIPANT_SAFE_REGION,
    grounding: {
      floorBoundaryY: 0.7,
      baselineRegion: { x: 0.12, y: 0.7, width: 0.76, height: 0.26 },
      treatment: 'floor-only',
    },
    previewEligible: true,
    exportEligible: true,
  },
  {
    id: 'cozy-room',
    displayName: 'Cozy Room',
    compactLabel: 'Cozy',
    useExistingBackground: false,
    backgroundColor: '#CFA88E',
    backgroundDecoration: [
      {
        kind: 'linear-gradient',
        rect: FULL_STAGE,
        from: { x: 0, y: 0 },
        to: { x: 1, y: 1 },
        stops: [
          { offset: 0, color: '#E7CBB6' },
          { offset: 1, color: '#B9826A' },
        ],
      },
      { kind: 'rect', rect: { x: 0.065, y: 0.11, width: 0.19, height: 0.27 }, fill: '#F5DDAF', opacity: 0.72, stroke: '#8F6658', strokeWidth: 0.006 },
      { kind: 'line', from: { x: 0.16, y: 0.11 }, to: { x: 0.16, y: 0.38 }, stroke: '#8F6658', strokeWidth: 0.004, opacity: 0.8 },
      { kind: 'line', from: { x: 0.065, y: 0.245 }, to: { x: 0.255, y: 0.245 }, stroke: '#8F6658', strokeWidth: 0.004, opacity: 0.8 },
      {
        kind: 'linear-gradient',
        rect: { x: 0, y: 0.68, width: 1, height: 0.32 },
        from: { x: 0.5, y: 0.68 },
        to: { x: 0.5, y: 1 },
        stops: [
          { offset: 0, color: '#9A6F5D' },
          { offset: 1, color: '#704D44' },
        ],
      },
      { kind: 'line', from: { x: 0, y: 0.68 }, to: { x: 1, y: 0.68 }, stroke: '#765044', strokeWidth: 0.004, opacity: 0.8 },
    ],
    foregroundElements: [
      { kind: 'rect', rect: { x: 0, y: 0.91, width: 1, height: 0.09 }, fill: '#5E3F39', opacity: 0.92 },
      { kind: 'line', from: { x: 0, y: 0.91 }, to: { x: 1, y: 0.91 }, stroke: '#E2B8A0', strokeWidth: 0.01, opacity: 0.82 },
    ],
    safeRegion: PARTICIPANT_SAFE_REGION,
    grounding: {
      floorBoundaryY: 0.68,
      baselineRegion: { x: 0.12, y: 0.68, width: 0.76, height: 0.25 },
      treatment: 'floor-only',
    },
    previewEligible: true,
    exportEligible: true,
  },
  {
    id: 'night-booth',
    displayName: 'Night Booth',
    compactLabel: 'Night',
    useExistingBackground: false,
    backgroundColor: '#181725',
    backgroundDecoration: [
      {
        kind: 'radial-gradient',
        rect: FULL_STAGE,
        center: { x: 0.5, y: 0.38 },
        innerRadius: 0.04,
        outerRadius: 0.7,
        stops: [
          { offset: 0, color: 'rgba(108,92,150,0.48)' },
          { offset: 0.55, color: 'rgba(45,39,68,0.72)' },
          { offset: 1, color: '#15141F' },
        ],
      },
      { kind: 'ellipse', center: { x: 0.1, y: 0.18 }, radiusX: 0.018, radiusY: 0.024, fill: '#FFD9A8', opacity: 0.52 },
      { kind: 'ellipse', center: { x: 0.89, y: 0.23 }, radiusX: 0.022, radiusY: 0.029, fill: '#C8B7FF', opacity: 0.56 },
      { kind: 'ellipse', center: { x: 0.82, y: 0.1 }, radiusX: 0.012, radiusY: 0.016, fill: '#FFD9A8', opacity: 0.42 },
      {
        kind: 'linear-gradient',
        rect: { x: 0, y: 0.73, width: 1, height: 0.27 },
        from: { x: 0.5, y: 0.73 },
        to: { x: 0.5, y: 1 },
        stops: [
          { offset: 0, color: '#242234' },
          { offset: 1, color: '#0F0E17' },
        ],
      },
      { kind: 'line', from: { x: 0, y: 0.73 }, to: { x: 1, y: 0.73 }, stroke: '#776B9C', strokeWidth: 0.003, opacity: 0.55 },
    ],
    foregroundElements: [
      { kind: 'rect', rect: { x: 0, y: 0.935, width: 1, height: 0.065 }, fill: '#0B0A12', opacity: 0.9 },
      { kind: 'line', from: { x: 0, y: 0.935 }, to: { x: 1, y: 0.935 }, stroke: '#8D7CC3', strokeWidth: 0.006, opacity: 0.7 },
    ],
    safeRegion: PARTICIPANT_SAFE_REGION,
    grounding: {
      floorBoundaryY: 0.73,
      baselineRegion: { x: 0.12, y: 0.73, width: 0.76, height: 0.23 },
      treatment: 'floor-only',
    },
    previewEligible: true,
    exportEligible: true,
  },
];

const SCENE_BY_ID = new Map(BOOTH_SHARED_SCENE_DEFINITIONS.map((scene) => [scene.id, scene]));

export function isBoothSharedSceneId(value: unknown): value is BoothSharedSceneId {
  return typeof value === 'string' && (BOOTH_SHARED_SCENE_IDS as readonly string[]).includes(value);
}

export function boothSharedSceneDefinition(value: unknown): BoothSharedSceneDefinition {
  return isBoothSharedSceneId(value)
    ? (SCENE_BY_ID.get(value) ?? BOOTH_SHARED_SCENE_DEFINITIONS[0]!)
    : BOOTH_SHARED_SCENE_DEFINITIONS[0]!;
}

export function scenePaintBounds(paint: BoothSharedScenePaint): BoothStageNormalizedRect {
  if (paint.kind === 'rect' || paint.kind === 'linear-gradient' || paint.kind === 'radial-gradient') return paint.rect;
  if (paint.kind === 'ellipse') {
    return {
      x: paint.center.x - paint.radiusX,
      y: paint.center.y - paint.radiusY,
      width: paint.radiusX * 2,
      height: paint.radiusY * 2,
    };
  }
  return {
    x: Math.min(paint.from.x, paint.to.x),
    y: Math.min(paint.from.y, paint.to.y),
    width: Math.abs(paint.to.x - paint.from.x),
    height: Math.abs(paint.to.y - paint.from.y),
  };
}

export function scenePaintBoundsToPixels(
  paint: BoothSharedScenePaint,
  width: number,
  height: number,
): BoothStageNormalizedRect {
  return stageRectToPixels(scenePaintBounds(paint), width, height);
}

export type BoothSharedSceneEvent = {
  type: 'scene_selected';
  sessionId: string;
  sceneId: BoothSharedSceneId;
  eventId: string;
  selectedBy: string;
  selectedAt: number;
  version: number;
};

export function createBoothSharedSceneEvent(
  input: Omit<BoothSharedSceneEvent, 'type'>,
): BoothSharedSceneEvent {
  return { type: 'scene_selected', ...input };
}

export function compareBoothSharedSceneEvents(
  left: BoothSharedSceneEvent,
  right: BoothSharedSceneEvent,
): number {
  if (left.eventId === right.eventId) return 0;
  if (left.version !== right.version) return left.version - right.version;
  if (left.selectedAt !== right.selectedAt) return left.selectedAt - right.selectedAt;
  if (left.eventId !== right.eventId) return left.eventId < right.eventId ? -1 : 1;
  return left.selectedBy < right.selectedBy ? -1 : left.selectedBy > right.selectedBy ? 1 : 0;
}

export function applyBoothSharedSceneEvent(
  current: BoothSharedSceneEvent | null,
  incoming: BoothSharedSceneEvent,
  sessionId: string,
): BoothSharedSceneEvent | null {
  if (incoming.sessionId !== sessionId) return current;
  if (!current || current.sessionId !== sessionId) return incoming;
  return compareBoothSharedSceneEvents(incoming, current) > 0 ? incoming : current;
}
