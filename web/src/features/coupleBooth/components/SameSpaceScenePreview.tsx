import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  DEFAULT_SAME_SPACE_BACKGROUND,
  type SameSpaceBackground,
} from '@shared/sameSpaceBackground';
import {
  computeSameSpacePersonPlacement,
  defaultPersonBounds,
  type SameSpaceNormalizedTransform,
  type SameSpacePersonBounds,
} from '@shared/sameSpaceComposition';
import { computeCompactCoupleComposition, toUserTransformDelta } from '@shared/compactCoupleComposition';
import {
  DEFAULT_BOOTH_SCENE_SPAN_MODE,
  type CaptureViewportMode,
  sceneSpecForSpanMode,
  type BoothSceneSpanMode,
} from '@shared/boothSceneSpec';
import {
  clampManualOffset,
  DEFAULT_SAME_SPACE_FRONT,
  DEFAULT_SAME_SPACE_MANUAL_OFFSET,
  SAME_SPACE_MANUAL_SCALE_CLAMP,
  type SameSpaceCompositionSlot,
  type SameSpaceFrontPreference,
  type SameSpaceManualOffset,
  type SameSpaceSoloLayout,
} from '@shared/sameSpaceLayoutSpec';
import { createParticipantStageLayers } from '@shared/coupleBoothStage';
import {
  bakeVisibleRectToManualPlacement,
  cloneSubjectPlacement,
  DEFAULT_SUBJECT_PLACEMENT,
  normalizeLogicalRect,
  resolveSubjectDrawRect,
  type NormalizedSubjectRect,
  type SubjectPlacement,
} from '@shared/subjectPlacement';
import {
  renderBoothSharedSceneBackground,
  renderBoothSharedSceneForeground,
} from '../composition/sameSpaceCanvasRenderer';
import { measureImageAlphaBounds } from '../utils/measureImageAlphaBounds';
import {
  drawImageMaybeMirrored,
  type BoothMirrorMeta,
} from '@shared/mirrorDraw';
import {
  collectSubjectHitsAtPoint,
  resolveOverlappingSubjectHit,
} from '../utils/subjectHitTest';
import type { AutoAlignmentSubject } from '@shared/autoAlignment';
import type { BoothSharedSceneId } from '@shared/sharedScene';
import { drawBoothCompanions, preloadBoothCompanions } from '../composition/boothCompanionCanvas';
import {
  boothParticipantLightingFilter,
  resolveBoothPairLighting,
  type BoothForegroundLightingStatistics,
} from '@shared/participantLighting';
import { measureForegroundLightingSource } from '../composition/participantLightingCanvas';

export type SameSpaceSceneLayer = {
  slot: SameSpaceCompositionSlot;
  url: string;
  transform?: SameSpaceNormalizedTransform;
  manualOffset?: SameSpaceManualOffset;
  mirror?: BoothMirrorMeta;
};

export type SameSpaceScenePreviewHandle = {
  getLogicalVisibleRects: () => Record<string, NormalizedSubjectRect>;
  getAutoAlignmentSubjects: () => AutoAlignmentSubject[];
  flush: () => void;
};

const EMPTY_COMPANIONS: import('@shared/coupleBoothStage').BoothCompanionSnapshot[] = [];

type Props = {
  companions?: import('@shared/coupleBoothStage').BoothCompanionSnapshot[];
  leftUrl?: string | null;
  rightUrl?: string | null;
  background?: SameSpaceBackground;
  sharedSceneId?: BoothSharedSceneId;
  lightingEnabled?: boolean;
  frontSlot?: SameSpaceFrontPreference;
  soloLayout?: SameSpaceSoloLayout;
  leftTransform?: SameSpaceNormalizedTransform;
  rightTransform?: SameSpaceNormalizedTransform;
  leftManualOffset?: SameSpaceManualOffset;
  rightManualOffset?: SameSpaceManualOffset;
  leftMirror?: BoothMirrorMeta | null;
  rightMirror?: BoothMirrorMeta | null;
  className?: string;
  alt?: string;
  exportMode?: boolean;
  /** Apply compact couple auto-fit before manual offsets. */
  compactFit?: boolean;
  /** one_cell / two_cell composition span — external frame stays 4:3. */
  sceneSpanMode?: BoothSceneSpanMode;
  captureViewportMode?: CaptureViewportMode;
  editable?: boolean;
  selectedSlot?: SameSpaceCompositionSlot | null;
  onSelectedSlotChange?: (slot: SameSpaceCompositionSlot) => void;
  onManualOffsetChange?: (slot: SameSpaceCompositionSlot, offset: SameSpaceManualOffset) => void;
  /** Called on pointer-up after a drag so callers can persist. */
  onManualOffsetCommit?: (slot: SameSpaceCompositionSlot, offset: SameSpaceManualOffset) => void;
  /** Stable participant ids for absolute placement SSOT. */
  leftSubjectId?: string | null;
  rightSubjectId?: string | null;
  placementsBySubjectId?: Record<string, SubjectPlacement> | null;
  frontSubjectId?: string | null;
  selectedSubjectId?: string | null;
  onSelectedSubjectChange?: (subjectId: string) => void;
  onPlacementsChange?: (next: Record<string, SubjectPlacement>) => void;
  onPlacementsCommit?: (next: Record<string, SubjectPlacement>) => void;
};

type LoadedLayer = {
  slot: SameSpaceCompositionSlot;
  img: HTMLImageElement;
  url: string;
  transform?: SameSpaceNormalizedTransform;
  bounds: SameSpacePersonBounds;
  mirror?: BoothMirrorMeta;
  /** Downsampled alpha for pointer hit-testing (optional). */
  alphaData?: ImageData | null;
  lightingStats?: BoothForegroundLightingStatistics | null;
};

type PlacementHit = {
  dest: { x: number; y: number; width: number; height: number };
  personDest: { x: number; y: number; width: number; height: number };
};

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

type DragState =
  | {
    mode: 'move';
    slot: SameSpaceCompositionSlot;
    subjectId: string | null;
    absolute: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    origin: SameSpaceManualOffset;
    originPersonDest: PlacementHit['personDest'];
  }
  | {
    mode: 'resize';
    slot: SameSpaceCompositionSlot;
    subjectId: string | null;
    absolute: boolean;
    pointerId: number;
    corner: ResizeCorner;
    startX: number;
    startY: number;
    origin: SameSpaceManualOffset;
    originPersonDest: PlacementHit['personDest'];
    /** Distance from person center to pointer at gesture start (CSS px). */
    startDist: number;
  }
  | {
    mode: 'pinch';
    slot: SameSpaceCompositionSlot;
    subjectId: string | null;
    absolute: boolean;
    origin: SameSpaceManualOffset;
    originPersonDest: PlacementHit['personDest'];
    startDist: number;
    pointers: Map<number, { x: number; y: number }>;
  };

const HANDLE_CSS_PX = 24;
const CLICK_CYCLE_PX = 5;

async function buildAlphaSample(img: HTMLImageElement): Promise<ImageData | null> {
  const width = Math.max(1, img.naturalWidth || img.width || 0);
  const height = Math.max(1, img.naturalHeight || img.height || 0);
  if (width < 2 || height < 2) return null;
  const maxEdge = 160;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  try {
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

function cornerCenters(person: PlacementHit['personDest']): Record<ResizeCorner, { x: number; y: number }> {
  return {
    nw: { x: person.x, y: person.y },
    ne: { x: person.x + person.width, y: person.y },
    sw: { x: person.x, y: person.y + person.height },
    se: { x: person.x + person.width, y: person.y + person.height },
  };
}

function hitResizeCorner(
  canvasX: number,
  canvasY: number,
  person: PlacementHit['personDest'],
  hitRadius: number,
): ResizeCorner | null {
  const corners = cornerCenters(person);
  let best: ResizeCorner | null = null;
  let bestDist = hitRadius;
  for (const key of Object.keys(corners) as ResizeCorner[]) {
    const c = corners[key];
    const dist = Math.hypot(canvasX - c.x, canvasY - c.y);
    if (dist <= bestDist) {
      bestDist = dist;
      best = key;
    }
  }
  return best;
}

function clonePlacementsMap(
  value: Record<string, SubjectPlacement> | null | undefined,
): Record<string, SubjectPlacement> {
  const out: Record<string, SubjectPlacement> = {};
  for (const [id, placement] of Object.entries(value ?? {})) {
    out[id] = cloneSubjectPlacement(placement);
  }
  return out;
}

function scalePersonDestAboutCenter(
  origin: PlacementHit['personDest'],
  factor: number,
): PlacementHit['personDest'] {
  const clamped = Math.min(
    SAME_SPACE_MANUAL_SCALE_CLAMP.scaleMax,
    Math.max(SAME_SPACE_MANUAL_SCALE_CLAMP.scaleMin, factor),
  );
  const width = origin.width * clamped;
  const height = origin.height * clamped;
  const cx = origin.x + origin.width / 2;
  const cy = origin.y + origin.height / 2;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  };
}

/**
 * Shared Same Space scene preview — backing store follows sceneSpanMode.
 * Images are cached by URL; transform edits redraw without reloading sources.
 */
export const SameSpaceScenePreview = forwardRef<SameSpaceScenePreviewHandle, Props>(function SameSpaceScenePreview({
  leftUrl,
  rightUrl,
  background = DEFAULT_SAME_SPACE_BACKGROUND,
  sharedSceneId = 'classic',
  lightingEnabled = true,
  frontSlot = DEFAULT_SAME_SPACE_FRONT,
  soloLayout = 'half',
  leftTransform,
  rightTransform,
  leftManualOffset,
  rightManualOffset,
  leftMirror = null,
  rightMirror = null,
  className,
  alt = '',
  exportMode = true,
  compactFit = true,
  sceneSpanMode = DEFAULT_BOOTH_SCENE_SPAN_MODE,
  captureViewportMode = 'desktop',
  editable = false,
  selectedSlot = null,
  onSelectedSlotChange,
  onManualOffsetChange,
  onManualOffsetCommit,
  leftSubjectId = null,
  rightSubjectId = null,
  placementsBySubjectId = null,
  frontSubjectId = null,
  selectedSubjectId = null,
  onSelectedSubjectChange,
  onPlacementsChange,
  onPlacementsCommit,
  companions = EMPTY_COMPANIONS,
}, ref) {
  // Packing base is always applied; compactFit is retained for API compatibility.
  void compactFit;
  const absoluteMode = placementsBySubjectId != null;
  const sceneSpec = sceneSpecForSpanMode(sceneSpanMode, captureViewportMode);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [assetsEpoch, setAssetsEpoch] = useState(0);

  useEffect(() => {
    let active = true;
    void preloadBoothCompanions(companions).then(() => { if (active) setAssetsEpoch((value) => value + 1); });
    return () => { active = false; };
  }, [companions]);
  const placementsRef = useRef<Partial<Record<SameSpaceCompositionSlot, PlacementHit>>>({});
  const packingBaseRef = useRef<Partial<Record<SameSpaceCompositionSlot, SameSpaceManualOffset>>>({});
  const logicalVisibleRectsRef = useRef<Record<string, NormalizedSubjectRect>>({});
  const dragRef = useRef<DragState | null>(null);
  const clickGestureRef = useRef<{
    slot: SameSpaceCompositionSlot;
    subjectId: string | null;
    x: number;
    y: number;
    moved: boolean;
    allowCycle: boolean;
  } | null>(null);
  const loadedRef = useRef<Partial<Record<SameSpaceCompositionSlot, LoadedLayer>>>({});
  const bgImageRef = useRef<{ presetId: string; url: string; image: HTMLImageElement } | null>(null);
  const frontImageRef = useRef<{ url: string; image: HTMLImageElement } | null>(null);
  const drawRafRef = useRef(0);
  const canvasSizeRef = useRef({ width: 0, height: 0, cssWidth: 0 });
  const placementsDraftRef = useRef<Record<string, SubjectPlacement>>(clonePlacementsMap(placementsBySubjectId));

  const offsetsRef = useRef({
    left: leftManualOffset ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
    right: rightManualOffset ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
  });
  offsetsRef.current = {
    left: leftManualOffset ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
    right: rightManualOffset ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
  };

  placementsDraftRef.current = clonePlacementsMap(placementsBySubjectId);

  const subjectIdForSlot = (slot: SameSpaceCompositionSlot): string | null => (
    slot === 'left' ? (leftSubjectId ?? null) : (rightSubjectId ?? null)
  );

  const slotForSubjectId = (subjectId: string | null | undefined): SameSpaceCompositionSlot | null => {
    if (!subjectId) return null;
    if (leftSubjectId && subjectId === leftSubjectId) return 'left';
    if (rightSubjectId && subjectId === rightSubjectId) return 'right';
    return null;
  };

  const effectiveSelectedSlot: SameSpaceCompositionSlot | null = absoluteMode
    ? (slotForSubjectId(selectedSubjectId) ?? selectedSlot)
    : selectedSlot;

  const effectiveFrontSlot: SameSpaceFrontPreference = (() => {
    const fromSubject = slotForSubjectId(frontSubjectId);
    return fromSubject ?? frontSlot;
  })();

  const urlKey = useMemo(
    () => `${leftUrl ?? ''}|${rightUrl ?? ''}|${background.type === 'image' ? `${background.url ?? ''}|${background.frontUrl ?? ''}` : ''}`,
    [background, leftUrl, rightUrl],
  );

  const layerMeta = useMemo(() => {
    const next: SameSpaceSceneLayer[] = [];
    if (leftUrl) {
      next.push({
        slot: 'left',
        url: leftUrl,
        transform: leftTransform,
        mirror: leftMirror ?? undefined,
      });
    }
    if (rightUrl) {
      next.push({
        slot: 'right',
        url: rightUrl,
        transform: rightTransform,
        mirror: rightMirror ?? undefined,
      });
    }
    return next;
  }, [leftMirror, leftTransform, leftUrl, rightMirror, rightTransform, rightUrl]);

  // Load bitmaps once per URL — never recreate object URLs or reload on transform.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setFailed(false);
      const nextLoaded: Partial<Record<SameSpaceCompositionSlot, LoadedLayer>> = {};
      await Promise.all(
        layerMeta.map(
          (layer) =>
            new Promise<void>((resolve) => {
              const existing = loadedRef.current[layer.slot];
              if (existing && existing.url === layer.url && existing.img.complete) {
                nextLoaded[layer.slot] = {
                  ...existing,
                  transform: layer.transform,
                  mirror: layer.mirror,
                };
                resolve();
                return;
              }
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => {
                void (async () => {
                  try {
                    if (typeof img.decode === 'function') await img.decode();
                  } catch {
                    /* decode optional */
                  }
                  if (cancelled) {
                    resolve();
                    return;
                  }
                  const bounds = await measureImageAlphaBounds(img);
                  const alphaData = await buildAlphaSample(img);
                  if (cancelled) {
                    resolve();
                    return;
                  }
                  nextLoaded[layer.slot] = {
                    slot: layer.slot,
                    img,
                    url: layer.url,
                    transform: layer.transform,
                    bounds,
                    mirror: layer.mirror,
                    alphaData,
                    lightingStats: measureForegroundLightingSource(img),
                  };
                  resolve();
                })();
              };
              img.onerror = () => resolve();
              img.src = layer.url;
            }),
        ),
      );
      if (cancelled) return;

      if (background.type === 'image' && background.url) {
        const cached = bgImageRef.current;
        if (!cached || cached.url !== background.url || cached.presetId !== background.presetId) {
          const bgImg = await new Promise<HTMLImageElement | null>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = background.url!;
          });
          if (cancelled) return;
          bgImageRef.current = bgImg
            ? { presetId: background.presetId, url: background.url, image: bgImg }
            : null;
        }
      } else {
        bgImageRef.current = null;
      }
      if (background.type === 'image' && background.frontUrl) {
        const cached = frontImageRef.current;
        if (!cached || cached.url !== background.frontUrl) {
          const frontImg = await new Promise<HTMLImageElement | null>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = background.frontUrl!;
          });
          if (cancelled) return;
          frontImageRef.current = frontImg ? { url: background.frontUrl, image: frontImg } : null;
        }
      } else {
        frontImageRef.current = null;
      }

      loadedRef.current = nextLoaded;
      if (Object.keys(nextLoaded).length === 0 && layerMeta.length > 0) {
        setFailed(true);
        return;
      }
      setAssetsEpoch((value) => value + 1);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [background, layerMeta, retry, urlKey]);

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssWidth = Math.max(120, canvas.clientWidth || 240);
    const cssHeight = Math.max(120, Math.round(cssWidth / sceneSpec.aspectRatio));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);

    // Only resize backing store when dimensions actually change (clears canvas).
    if (
      Math.abs(canvas.width - width) >= 2
      || Math.abs(canvas.height - height) >= 2
      || canvas.width <= 0
      || canvas.height <= 0
    ) {
      canvas.width = width;
      canvas.height = height;
    }
    canvasSizeRef.current = { width: canvas.width, height: canvas.height, cssWidth };

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ready = Object.values(loadedRef.current).filter(Boolean) as LoadedLayer[];
    if (ready.length === 0) return;

    // Offscreen compose then blit — never leave a cleared visible frame mid-load.
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';

    const bgCache = bgImageRef.current;
    renderBoothSharedSceneBackground(
      octx,
      canvas.width,
      canvas.height,
      sharedSceneId,
      background,
      bgCache
        ? { presetId: bgCache.presetId, url: bgCache.url, image: bgCache.image }
        : null,
    );

    const bySlot: Partial<Record<SameSpaceCompositionSlot, LoadedLayer>> = {};
    for (const row of ready) bySlot[row.slot] = row;
    const participantCount = ready.length;
    const pairLighting = resolveBoothPairLighting(
      bySlot.left?.lightingStats,
      bySlot.right?.lightingStats,
      sharedSceneId,
      lightingEnabled,
    );
    const lightingForSlot = (slot: SameSpaceCompositionSlot) =>
      slot === 'left' ? pairLighting.participantA : pairLighting.participantB;

    const nextPlacements: typeof placementsRef.current = {};
    const nextLogical: Record<string, NormalizedSubjectRect> = {};

    // Paint order follows front for export fidelity; when editable, lift
    // the selected subject for visibility only (does not mutate front).
    const paintOrder = (() => {
      const base = createParticipantStageLayers(['left', 'right'], effectiveFrontSlot)
        .map((layer) => layer.participantId as SameSpaceCompositionSlot);
      if (!editable || !effectiveSelectedSlot || !bySlot[effectiveSelectedSlot]) return base;
      return [...base.filter((slot) => slot !== effectiveSelectedSlot), effectiveSelectedSlot];
    })();

    if (absoluteMode) {
      const placementMap = placementsDraftRef.current;
      const autoPacking = bySlot.left && bySlot.right
        ? {
          leftBounds: bySlot.left.bounds,
          rightBounds: bySlot.right.bounds,
          leftManual: DEFAULT_SAME_SPACE_MANUAL_OFFSET,
          rightManual: DEFAULT_SAME_SPACE_MANUAL_OFFSET,
        }
        : null;

      for (const slot of paintOrder) {
        const row = bySlot[slot];
        if (!row) continue;
        const subjectId = subjectIdForSlot(slot);
        if (!subjectId) continue;
        const placement = placementMap[subjectId] ?? DEFAULT_SUBJECT_PLACEMENT;
        const resolved = resolveSubjectDrawRect({
          frameWidth: canvas.width,
          frameHeight: canvas.height,
          placement,
          alphaBounds: row.bounds ?? defaultPersonBounds(),
          sourceWidth: row.img.naturalWidth,
          sourceHeight: row.img.naturalHeight,
          homeSlot: slot,
          soloLayout,
          participantCount,
          spanMode: sceneSpanMode,
          autoPacking,
        });
        nextPlacements[slot] = { dest: resolved.dest, personDest: resolved.personDest };
        nextLogical[subjectId] = normalizeLogicalRect(
          resolved.personDest,
          canvas.width,
          canvas.height,
        );
        octx.save();
        octx.filter = boothParticipantLightingFilter(lightingForSlot(slot));
        drawImageMaybeMirrored(
          octx,
          row.img,
          0,
          0,
          row.img.naturalWidth,
          row.img.naturalHeight,
          resolved.dest.x,
          resolved.dest.y,
          resolved.dest.width,
          resolved.dest.height,
          row.mirror,
        );
        octx.restore();
        if (editable && effectiveSelectedSlot === slot) {
          const hitCss = (HANDLE_CSS_PX * canvas.width) / Math.max(1, cssWidth);
          const handleR = Math.max(6, hitCss * 0.35);
          octx.save();
          octx.strokeStyle = 'rgba(155, 139, 196, 0.95)';
          octx.lineWidth = Math.max(2, Math.round(canvas.height * 0.004));
          octx.strokeRect(
            resolved.personDest.x,
            resolved.personDest.y,
            resolved.personDest.width,
            resolved.personDest.height,
          );
          const corners = cornerCenters(resolved.personDest);
          octx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          octx.strokeStyle = 'rgba(128, 106, 182, 0.95)';
          for (const key of Object.keys(corners) as ResizeCorner[]) {
            const c = corners[key];
            octx.beginPath();
            octx.arc(c.x, c.y, handleR, 0, Math.PI * 2);
            octx.fill();
            octx.stroke();
          }
          octx.restore();
        }
      }
    } else {
      let leftManual = offsetsRef.current.left;
      let rightManual = offsetsRef.current.right;
      // Always recompute packing BASE for the active span; user manuals layer on top.
      // Never bake packing into stored user transforms during paint.
      if (bySlot.left && bySlot.right) {
        const compact = computeCompactCoupleComposition({
          sceneWidth: canvas.width,
          sceneHeight: canvas.height,
          leftBounds: bySlot.left.bounds,
          rightBounds: bySlot.right.bounds,
          leftManual,
          rightManual,
          spanMode: sceneSpanMode,
        });
        leftManual = compact.leftTransform;
        rightManual = compact.rightTransform;
        packingBaseRef.current = {
          left: compact.leftBase,
          right: compact.rightBase,
        };
      }

      for (const slot of paintOrder) {
        const row = bySlot[slot];
        if (!row) continue;
        const manual = slot === 'left' ? leftManual : rightManual;
        const placement = computeSameSpacePersonPlacement({
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          sourceWidth: row.img.naturalWidth,
          sourceHeight: row.img.naturalHeight,
          personBounds: row.bounds ?? defaultPersonBounds(),
          normalizedTransform: row.transform ?? { x: 0, y: 0, scale: 1 },
          manualOffset: manual,
          slot,
          soloLayout,
          participantCount,
          spanMode: sceneSpanMode,
        });
        nextPlacements[slot] = { dest: placement.dest, personDest: placement.personDest };
        const subjectId = subjectIdForSlot(slot) ?? slot;
        nextLogical[subjectId] = normalizeLogicalRect(
          placement.personDest,
          canvas.width,
          canvas.height,
        );
        octx.save();
        octx.filter = boothParticipantLightingFilter(lightingForSlot(slot));
        drawImageMaybeMirrored(
          octx,
          row.img,
          0,
          0,
          row.img.naturalWidth,
          row.img.naturalHeight,
          placement.dest.x,
          placement.dest.y,
          placement.dest.width,
          placement.dest.height,
          row.mirror,
        );
        octx.restore();
        if (editable && effectiveSelectedSlot === slot) {
          const hitCss = (HANDLE_CSS_PX * canvas.width) / Math.max(1, cssWidth);
          const handleR = Math.max(6, hitCss * 0.35);
          octx.save();
          octx.strokeStyle = 'rgba(155, 139, 196, 0.95)';
          octx.lineWidth = Math.max(2, Math.round(canvas.height * 0.004));
          octx.strokeRect(
            placement.personDest.x,
            placement.personDest.y,
            placement.personDest.width,
            placement.personDest.height,
          );
          const corners = cornerCenters(placement.personDest);
          octx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          octx.strokeStyle = 'rgba(128, 106, 182, 0.95)';
          for (const key of Object.keys(corners) as ResizeCorner[]) {
            const c = corners[key];
            octx.beginPath();
            octx.arc(c.x, c.y, handleR, 0, Math.PI * 2);
            octx.fill();
            octx.stroke();
          }
          octx.restore();
        }
      }
    }

    placementsRef.current = nextPlacements;
    logicalVisibleRectsRef.current = nextLogical;

    // Canonical scene foreground always paints after every participant layer.
    drawBoothCompanions(octx, canvas.width, canvas.height, companions);
    renderBoothSharedSceneForeground(
      octx,
      canvas.width,
      canvas.height,
      sharedSceneId,
      frontImageRef.current?.image ?? null,
    );

    if (!exportMode && participantCount === 1) {
      const empty: SameSpaceCompositionSlot = bySlot.left ? 'right' : 'left';
      octx.save();
      octx.globalAlpha = 0.4;
      octx.fillStyle = '#332E3D';
      octx.font = `600 ${Math.max(11, Math.round(canvas.height * 0.045))}px Outfit, system-ui, sans-serif`;
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.fillText('상대를 기다리고 있어요', empty === 'left' ? canvas.width * 0.25 : canvas.width * 0.75, canvas.height * 0.5);
      octx.restore();
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0);
  };

  const paintRef = useRef(paint);
  paintRef.current = paint;

  const schedulePaint = () => {
    if (drawRafRef.current) return;
    drawRafRef.current = window.requestAnimationFrame(() => {
      drawRafRef.current = 0;
      paintRef.current();
    });
  };

  useImperativeHandle(ref, () => ({
    getLogicalVisibleRects: () => {
      const out: Record<string, NormalizedSubjectRect> = {};
      for (const [id, rect] of Object.entries(logicalVisibleRectsRef.current)) {
        out[id] = { ...rect };
      }
      return out;
    },
    getAutoAlignmentSubjects: () => {
      const subjects: AutoAlignmentSubject[] = [];
      for (const slot of ['left', 'right'] as const) {
        const participantId = slot === 'left' ? leftSubjectId : rightSubjectId;
        if (!participantId) continue;
        const loaded = loadedRef.current[slot];
        const sourceBounds = loaded?.bounds;
        subjects.push({
          participantId,
          slot,
          visibleBounds: logicalVisibleRectsRef.current[participantId]
            ? { ...logicalVisibleRectsRef.current[participantId]! }
            : null,
          sourceVisibleBounds: sourceBounds
            ? {
              x: sourceBounds.minX,
              y: sourceBounds.minY,
              width: sourceBounds.maxX - sourceBounds.minX,
              height: sourceBounds.maxY - sourceBounds.minY,
            }
            : null,
          sourceAspectRatio: loaded
            ? loaded.img.naturalWidth / Math.max(1, loaded.img.naturalHeight)
            : null,
        });
      }
      return subjects;
    },
    flush: () => {
      if (drawRafRef.current) {
        window.cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = 0;
      }
      paintRef.current();
    },
  }), [leftSubjectId, rightSubjectId]);

  useEffect(() => {
    schedulePaint();
    return () => {
      if (drawRafRef.current) {
        window.cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = 0;
      }
    };
    // Transforms / selection change paint only — never reload bitmaps.
  }, [
    assetsEpoch,
    companions,
    background,
    compactFit,
    editable,
    exportMode,
    frontSlot,
    frontSubjectId,
    leftManualOffset,
    lightingEnabled,
    leftSubjectId,
    placementsBySubjectId,
    rightManualOffset,
    rightSubjectId,
    sharedSceneId,
    sceneSpanMode,
    sceneSpec.aspectRatio,
    selectedSlot,
    selectedSubjectId,
    soloLayout,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => schedulePaint());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const clientToCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
      rect,
    };
  };

  const emitSelection = (slot: SameSpaceCompositionSlot) => {
    onSelectedSlotChange?.(slot);
    const subjectId = subjectIdForSlot(slot);
    if (subjectId) onSelectedSubjectChange?.(subjectId);
  };

  const emitAbsolutePlacements = (
    next: Record<string, SubjectPlacement>,
    commit: boolean,
  ) => {
    placementsDraftRef.current = clonePlacementsMap(next);
    onPlacementsChange?.(clonePlacementsMap(next));
    if (commit) onPlacementsCommit?.(clonePlacementsMap(next));
    schedulePaint();
  };

  const hitTest = (
    clientX: number,
    clientY: number,
    options?: { preferCycleFrom?: SameSpaceCompositionSlot | null },
  ): SameSpaceCompositionSlot | null => {
    const pt = clientToCanvas(clientX, clientY);
    if (!pt) return null;
    const slots = (Object.keys(placementsRef.current) as SameSpaceCompositionSlot[])
      .filter((slot) => Boolean(placementsRef.current[slot]));
    const candidates = collectSubjectHitsAtPoint({
      point: { x: pt.x, y: pt.y },
      slots,
      getPersonDest: (slot) => placementsRef.current[slot]?.personDest ?? null,
      getDest: (slot) => placementsRef.current[slot]?.dest ?? null,
      getAlphaData: (slot) => loadedRef.current[slot]?.alphaData ?? null,
    });
    return resolveOverlappingSubjectHit({
      candidates,
      drawOrder: createParticipantStageLayers(['left', 'right'], effectiveFrontSlot)
        .map((layer) => layer.participantId as SameSpaceCompositionSlot),
      selectedSlot: effectiveSelectedSlot,
      preferCycleFrom: options?.preferCycleFrom,
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canEditAbsolute = absoluteMode && Boolean(onPlacementsChange);
    const canEditLegacy = !absoluteMode && Boolean(onManualOffsetChange);
    if (!editable || (!canEditAbsolute && !canEditLegacy)) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pt = clientToCanvas(event.clientX, event.clientY);
    if (!pt) return;

    // Two-finger pinch: if a move/resize is active for another pointer, upgrade.
    const existing = dragRef.current;
    if (existing && (existing.mode === 'move' || existing.mode === 'resize') && existing.pointerId !== event.pointerId) {
      const pointers = new Map<number, { x: number; y: number }>();
      pointers.set(existing.pointerId, { x: existing.startX, y: existing.startY });
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const [a, b] = [...pointers.values()];
      const origin = existing.absolute
        ? existing.origin
        : toUserTransformDelta(
          packingBaseRef.current[existing.slot] ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
          offsetsRef.current[existing.slot],
        );
      dragRef.current = {
        mode: 'pinch',
        slot: existing.slot,
        subjectId: existing.subjectId,
        absolute: existing.absolute,
        origin,
        originPersonDest: existing.originPersonDest,
        startDist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)),
        pointers,
      };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    // Prefer selected subject under the pointer; only cycle on a short click (pointerup).
    let slot = hitTest(event.clientX, event.clientY);
    if (!slot || !layerMeta.some((layer) => layer.slot === slot)) return;
    const subjectId = subjectIdForSlot(slot);
    const alreadySelected = absoluteMode
      ? Boolean(subjectId && selectedSubjectId === subjectId)
      : effectiveSelectedSlot === slot;

    // Resize handles only on the currently selected subject.
    const selectedHit = effectiveSelectedSlot ? placementsRef.current[effectiveSelectedSlot] : null;
    const hitRadius = (HANDLE_CSS_PX * canvas.width) / Math.max(1, canvasSizeRef.current.cssWidth || canvas.clientWidth || 1);
    const selectedCorner = selectedHit
      ? hitResizeCorner(pt.x, pt.y, selectedHit.personDest, hitRadius)
      : null;
    if (selectedCorner && effectiveSelectedSlot) {
      slot = effectiveSelectedSlot;
    }

    emitSelection(slot);
    const activeSubjectId = subjectIdForSlot(slot);
    clickGestureRef.current = {
      slot,
      subjectId: activeSubjectId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      allowCycle: alreadySelected,
    };
    const hit = placementsRef.current[slot];
    const corner = slot === effectiveSelectedSlot || selectedCorner
      ? (selectedCorner ?? (hit ? hitResizeCorner(pt.x, pt.y, hit.personDest, hitRadius) : null))
      : null;
    const packingBase = packingBaseRef.current[slot] ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET;
    const origin = absoluteMode
      ? DEFAULT_SAME_SPACE_MANUAL_OFFSET
      : toUserTransformDelta(packingBase, offsetsRef.current[slot]);
    const originPersonDest = hit
      ? { ...hit.personDest }
      : { x: 0, y: 0, width: 1, height: 1 };

    if (corner && hit) {
      const centerX = hit.personDest.x + hit.personDest.width / 2;
      const centerY = hit.personDest.y + hit.personDest.height / 2;
      const startDist = Math.max(1, Math.hypot(pt.x - centerX, pt.y - centerY));
      dragRef.current = {
        mode: 'resize',
        slot,
        subjectId: activeSubjectId,
        absolute: absoluteMode,
        pointerId: event.pointerId,
        corner,
        startX: event.clientX,
        startY: event.clientY,
        origin,
        originPersonDest,
        startDist,
      };
    } else {
      dragRef.current = {
        mode: 'move',
        slot,
        subjectId: activeSubjectId,
        absolute: absoluteMode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin,
        originPersonDest,
      };
    }
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const applyAbsolutePersonDest = (
    subjectId: string,
    personDest: PlacementHit['personDest'],
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const next = clonePlacementsMap(placementsDraftRef.current);
    next[subjectId] = bakeVisibleRectToManualPlacement(
      personDest,
      canvas.width,
      canvas.height,
    );
    emitAbsolutePlacements(next, false);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    if (drag.absolute && !onPlacementsChange) return;
    if (!drag.absolute && !onManualOffsetChange) return;

    if (drag.mode === 'pinch') {
      drag.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (drag.pointers.size < 2) return;
      const pts = [...drag.pointers.values()];
      const dist = Math.max(1, Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y));
      const factor = dist / drag.startDist;
      if (drag.absolute && drag.subjectId) {
        applyAbsolutePersonDest(
          drag.subjectId,
          scalePersonDestAboutCenter(drag.originPersonDest, factor),
        );
      } else {
        const nextScale = drag.origin.scale * factor;
        onManualOffsetChange?.(drag.slot, clampManualOffset({
          ...drag.origin,
          scale: nextScale,
          mode: 'manual',
        }));
      }
      event.preventDefault();
      return;
    }

    if (drag.pointerId !== event.pointerId) return;
    const rect = canvas.getBoundingClientRect();

    if (drag.mode === 'move') {
      if (clickGestureRef.current && Math.hypot(event.clientX - clickGestureRef.current.x, event.clientY - clickGestureRef.current.y) > CLICK_CYCLE_PX) {
        clickGestureRef.current.moved = true;
      }
      if (drag.absolute && drag.subjectId) {
        const dx = ((event.clientX - drag.startX) / Math.max(1, rect.width)) * canvas.width;
        const dy = ((event.clientY - drag.startY) / Math.max(1, rect.height)) * canvas.height;
        applyAbsolutePersonDest(drag.subjectId, {
          ...drag.originPersonDest,
          x: drag.originPersonDest.x + dx,
          y: drag.originPersonDest.y + dy,
        });
      } else {
        const dx = (event.clientX - drag.startX) / Math.max(1, rect.width);
        const dy = (event.clientY - drag.startY) / Math.max(1, rect.height);
        onManualOffsetChange?.(drag.slot, clampManualOffset({
          offsetX: drag.origin.offsetX + dx,
          offsetY: drag.origin.offsetY + dy,
          scale: drag.origin.scale,
          mode: 'manual',
        }));
      }
      event.preventDefault();
      return;
    }

    // Uniform scale about person center — never stretch axes independently.
    if (drag.absolute && drag.subjectId) {
      const pt = clientToCanvas(event.clientX, event.clientY);
      if (!pt) return;
      const centerX = drag.originPersonDest.x + drag.originPersonDest.width / 2;
      const centerY = drag.originPersonDest.y + drag.originPersonDest.height / 2;
      const dist = Math.max(1, Math.hypot(pt.x - centerX, pt.y - centerY));
      applyAbsolutePersonDest(
        drag.subjectId,
        scalePersonDestAboutCenter(drag.originPersonDest, dist / drag.startDist),
      );
      event.preventDefault();
      return;
    }

    const pt = clientToCanvas(event.clientX, event.clientY);
    const hit = placementsRef.current[drag.slot];
    if (!pt || !hit) return;
    const centerX = hit.personDest.x + hit.personDest.width / 2;
    const centerY = hit.personDest.y + hit.personDest.height / 2;
    const dist = Math.max(1, Math.hypot(pt.x - centerX, pt.y - centerY));
    const nextScale = drag.origin.scale * (dist / drag.startDist);
    onManualOffsetChange?.(drag.slot, clampManualOffset({
      ...drag.origin,
      scale: Math.min(
        SAME_SPACE_MANUAL_SCALE_CLAMP.scaleMax,
        Math.max(SAME_SPACE_MANUAL_SCALE_CLAMP.scaleMin, nextScale),
      ),
      mode: 'manual',
    }));
    event.preventDefault();
  };

  const endPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'pinch') {
      drag.pointers.delete(event.pointerId);
      canvasRef.current?.releasePointerCapture(event.pointerId);
      if (drag.pointers.size === 0) {
        dragRef.current = null;
        clickGestureRef.current = null;
        if (drag.absolute) {
          emitAbsolutePlacements(placementsDraftRef.current, true);
        } else {
          onManualOffsetCommit?.(drag.slot, offsetsRef.current[drag.slot]);
        }
      }
      return;
    }
    if (drag.pointerId !== event.pointerId) return;
    const gesture = clickGestureRef.current;
    dragRef.current = null;
    clickGestureRef.current = null;
    canvasRef.current?.releasePointerCapture(event.pointerId);

    // Short click on overlapping subjects cycles selection without committing a drag.
    if (
      gesture
      && gesture.allowCycle
      && !gesture.moved
      && drag.mode === 'move'
      && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= CLICK_CYCLE_PX
    ) {
      const cycled = hitTest(event.clientX, event.clientY, { preferCycleFrom: gesture.slot });
      if (cycled && cycled !== gesture.slot) {
        emitSelection(cycled);
        return;
      }
    }

    if (drag.absolute) {
      emitAbsolutePlacements(placementsDraftRef.current, true);
    } else {
      onManualOffsetCommit?.(drag.slot, offsetsRef.current[drag.slot]);
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    if (!editable) return;
    if (!event.ctrlKey && !event.metaKey) return;
    if (absoluteMode) {
      if (!onPlacementsChange || !selectedSubjectId) return;
      const hitSlot = slotForSubjectId(selectedSubjectId);
      const hit = hitSlot ? placementsRef.current[hitSlot] : null;
      const canvas = canvasRef.current;
      if (!hit || !canvas) return;
      event.preventDefault();
      const delta = -event.deltaY * 0.0015;
      applyAbsolutePersonDest(
        selectedSubjectId,
        scalePersonDestAboutCenter(hit.personDest, 1 + delta),
      );
      return;
    }
    if (!onManualOffsetChange || !selectedSlot) return;
    event.preventDefault();
    const delta = -event.deltaY * 0.0015;
    const packingBase = packingBaseRef.current[selectedSlot] ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET;
    const current = toUserTransformDelta(packingBase, offsetsRef.current[selectedSlot]);
    onManualOffsetChange(selectedSlot, clampManualOffset({
      ...current,
      scale: current.scale * (1 + delta),
      mode: 'manual',
    }));
  };

  if (layerMeta.length === 0) {
    return (
      <div
        className={`same-space-scene is-empty ${className ?? ''}`.trim()}
        data-span={sceneSpanMode}
        data-capture-viewport={captureViewportMode}
        aria-label={alt}
      />
    );
  }

  return (
    <div
      className={`same-space-scene ${className ?? ''}`.trim()}
      data-span={sceneSpanMode}
      data-capture-viewport={captureViewportMode}
      style={{ aspectRatio: `${sceneSpec.width} / ${sceneSpec.height}` }}
    >
      <canvas
        ref={canvasRef}
        aria-label={alt}
        style={editable ? { touchAction: 'none', cursor: 'grab' } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
      />
      {failed ? (
        <button type="button" className="same-space-scene-retry" onClick={() => setRetry((value) => value + 1)}>
          다시 시도
        </button>
      ) : null}
    </div>
  );
});
