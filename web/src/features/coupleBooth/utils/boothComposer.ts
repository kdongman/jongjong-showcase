import { computeBoothStripLayout, computeCenterCrop, computeSameSpaceStripLayout } from '@shared/layout';
import {
  DEFAULT_SAME_SPACE_BACKGROUND,
  type SameSpaceBackground,
} from '@shared/sameSpaceBackground';
import {
  applyBoothColorModeToCanvas,
  DEFAULT_BOOTH_COLOR_MODE,
  type BoothColorMode,
} from '@shared/boothColorMode';
import {
  type SameSpaceNormalizedTransform,
  type SameSpacePersonBounds,
} from '@shared/sameSpaceComposition';
import {
  DEFAULT_SAME_SPACE_FRONT,
  DEFAULT_SAME_SPACE_MANUAL_OFFSET,
  type SameSpaceCompositionSlot,
  type SameSpaceFrontPreference,
  type SameSpaceManualOffset,
  type SameSpaceSoloLayout,
} from '@shared/sameSpaceLayoutSpec';
import {
  resolveSubjectDrawRect,
  type SubjectPlacement,
} from '@shared/subjectPlacement';
import {
  LEGACY_BOOTH_SCENE_SPAN_MODE,
  type CaptureViewportMode,
  type BoothSceneSpanMode,
} from '@shared/boothSceneSpec';
import {
  drawImageMaybeMirrored,
  shouldApplyCanvasMirror,
  type BoothMirrorMeta,
} from '@shared/mirrorDraw';
import { FINAL_JPEG_QUALITY, FINAL_OUTPUT_HEIGHT, FINAL_OUTPUT_WIDTH } from '@shared/types';
import {
  createParticipantStageLayers,
  type BoothCompanionSnapshot,
} from '@shared/coupleBoothStage';
import { drawBoothCompanions, preloadBoothCompanions } from '../composition/boothCompanionCanvas';
import { measureImageAlphaBounds } from './measureImageAlphaBounds';
import {
  renderBoothSharedSceneBackground,
  renderBoothSharedSceneForeground,
} from '../composition/sameSpaceCanvasRenderer';
import type { BoothSharedSceneId } from '@shared/sharedScene';
import {
  boothParticipantLightingFilter,
  clampBoothParticipantLighting,
  resolveBoothPairLighting,
  type BoothParticipantLighting,
} from '@shared/participantLighting';
import { measureForegroundLightingSource } from '../composition/participantLightingCanvas';

export { computeBoothStripLayout };

export type FinalStripCell = {
  hostUri?: string;
  guestUri?: string;
  transform?: BoothCropTransform;
  hostMirror?: BoothAssetMirror;
  guestMirror?: BoothAssetMirror;
  /** @deprecated Prefer leftCutoutUri/rightCutoutUri */
  hostCutoutUri?: string;
  guestCutoutUri?: string;
  leftCutoutUri?: string;
  rightCutoutUri?: string;
  leftBounds?: SameSpacePersonBounds | null;
  rightBounds?: SameSpacePersonBounds | null;
  leftTransform?: SameSpaceNormalizedTransform;
  rightTransform?: SameSpaceNormalizedTransform;
  leftManualOffset?: SameSpaceManualOffset;
  rightManualOffset?: SameSpaceManualOffset;
  leftSubjectId?: string | null;
  rightSubjectId?: string | null;
  placementsBySubjectId?: Record<string, SubjectPlacement> | null;
  frontSubjectId?: string | null;
  leftMirror?: BoothMirrorMeta | null;
  rightMirror?: BoothMirrorMeta | null;
  background?: SameSpaceBackground;
  sharedSceneId?: BoothSharedSceneId;
  lightingEnabled?: boolean;
  leftLighting?: BoothParticipantLighting | null;
  rightLighting?: BoothParticipantLighting | null;
  frontSlot?: SameSpaceFrontPreference;
  soloLayout?: SameSpaceSoloLayout;
  /** When true, skip re-packing and use stored manuals as authoritative. */
  useStoredManualOffsets?: boolean;
  companions?: BoothCompanionSnapshot[];
};

export type BoothAssetMirror = BoothMirrorMeta & {
  mirrorX: boolean;
  mirrorBakedIntoAsset: boolean;
};

/** Normalized per-slot edit state shared by the DOM preview and canvas export. */
export type BoothCropTransform = { scale: number; x: number; y: number };
export const DEFAULT_BOOTH_CROP: BoothCropTransform = { scale: 1, x: 0, y: 0 };

/** CSS counterpart of drawCover's normalized crop window. */
export function boothCropCssTransform(transform: BoothCropTransform = DEFAULT_BOOTH_CROP): string {
  const scale = Math.min(2.5, Math.max(1, transform.scale));
  const x = -transform.x * (scale - 1) * 100;
  const y = -transform.y * (scale - 1) * 100;
  return `translate(${x}%, ${y}%) scale(${scale})`;
}

export const BOOTH_FRAME_OPTIONS = [
  { id: 'classic', label: '클래식', background: '#F7F2FA', accent: '#806AB6', ink: '#332E3D' },
  { id: 'midnight', label: '미드나잇', background: '#1D1A25', accent: '#E8C6FF', ink: '#FFF8FF' },
  { id: 'blush', label: '블러시', background: '#FFF0F4', accent: '#D45F88', ink: '#4D2735' },
] as const;

export type BoothFrameId = (typeof BOOTH_FRAME_OPTIONS)[number]['id'];

export function formatBoothDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

async function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`IMAGE_LOAD_FAILED:${uri}`));
    img.src = uri;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  transform: BoothCropTransform = DEFAULT_BOOTH_CROP,
  mirror: BoothAssetMirror = { mirrorX: false, mirrorBakedIntoAsset: true },
): void {
  const cover = computeCenterCrop(img.naturalWidth, img.naturalHeight, dw, dh);
  const scale = Math.min(2.5, Math.max(1, transform.scale));
  const sw = cover.sw / scale;
  const sh = cover.sh / scale;
  const sx = Math.max(0, Math.min(img.naturalWidth - sw, cover.sx + transform.x * (cover.sw - sw)));
  const sy = Math.max(0, Math.min(img.naturalHeight - sh, cover.sy + transform.y * (cover.sh - sh)));
  if (shouldApplyCanvasMirror(mirror)) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
    return;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function resolveCellCutouts(cell: FinalStripCell): {
  left?: string;
  right?: string;
} {
  return {
    left: cell.leftCutoutUri ?? cell.hostCutoutUri,
    right: cell.rightCutoutUri ?? cell.guestCutoutUri,
  };
}

/** Compose the final strip on an offscreen canvas (width follows span mode). */
export async function composeFinalBoothStrip(
  cells: FinalStripCell[],
  dateLabel = formatBoothDate(),
  frameId: BoothFrameId = 'classic',
  companions: BoothCompanionSnapshot[] = [],
  colorMode: BoothColorMode = DEFAULT_BOOTH_COLOR_MODE,
  sceneSpanMode: BoothSceneSpanMode = LEGACY_BOOTH_SCENE_SPAN_MODE,
  captureViewportMode: CaptureViewportMode = 'desktop',
): Promise<string> {
  const frame = BOOTH_FRAME_OPTIONS.find((option) => option.id === frameId) ?? BOOTH_FRAME_OPTIONS[0];
  const usesSameSpace = cells.some((cell) => Boolean(cell?.leftCutoutUri || cell?.rightCutoutUri || cell?.hostCutoutUri || cell?.guestCutoutUri));
  const layout = usesSameSpace
    ? computeSameSpaceStripLayout(sceneSpanMode, {
      exportScale: 1,
      useLogicalScene: true,
      outputHeight: FINAL_OUTPUT_HEIGHT,
      captureViewportMode,
    })
    : computeBoothStripLayout(FINAL_OUTPUT_WIDTH, FINAL_OUTPUT_HEIGHT);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNSUPPORTED');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = frame.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.fillStyle = frame.accent;
  ctx.font = '800 34px Outfit, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('JONGJONG', layout.width / 2, layout.brandY);

  const sharedSceneForegrounds: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    sceneId: BoothSharedSceneId;
    roomFrontPlate: HTMLImageElement | null;
  }> = [];

  for (let index = 0; index < layout.rows.length; index += 1) {
    const row = layout.rows[index];
    const cell = cells[index];
    const cutouts = cell ? resolveCellCutouts(cell) : {};
    const sameSpace = Boolean(cutouts.left || cutouts.right);

    if (sameSpace && cell) {
      const sceneWidth = layout.sameSpaceFullWidth
        ? layout.cellWidth
        : row.rightX + layout.cellWidth - row.leftX;
      const sceneHeight = layout.cellHeight;
      ctx.save();
      roundRect(ctx, row.leftX, row.y, sceneWidth, sceneHeight, 8);
      ctx.clip();
      ctx.save();
      ctx.translate(row.leftX, row.y);
      let backgroundImage: { presetId: string; url: string; image: CanvasImageSource } | null = null;
      const bg = cell.background ?? DEFAULT_SAME_SPACE_BACKGROUND;
      if (bg.type === 'image' && bg.url) {
        try {
          const loaded = await loadImage(bg.url);
          backgroundImage = { presetId: bg.presetId, url: bg.url, image: loaded };
        } catch {
          backgroundImage = null;
        }
      }
      let roomFrontPlate: HTMLImageElement | null = null;
      if (bg.type === 'image' && bg.frontUrl) {
        try { roomFrontPlate = await loadImage(bg.frontUrl); } catch { roomFrontPlate = null; }
      }
      renderBoothSharedSceneBackground(
        ctx,
        sceneWidth,
        sceneHeight,
        cell.sharedSceneId ?? 'classic',
        bg,
        backgroundImage,
      );
      ctx.restore();

      const leftImg = cutouts.left ? await loadImage(cutouts.left) : null;
      const rightImg = cutouts.right ? await loadImage(cutouts.right) : null;
      const participantCount = (leftImg ? 1 : 0) + (rightImg ? 1 : 0);
      const images: Partial<Record<SameSpaceCompositionSlot, HTMLImageElement>> = {};
      if (leftImg) images.left = leftImg;
      if (rightImg) images.right = rightImg;
      const measuredLighting = resolveBoothPairLighting(
        measureForegroundLightingSource(leftImg),
        measureForegroundLightingSource(rightImg),
        cell.sharedSceneId ?? 'classic',
        cell.lightingEnabled !== false,
      );
      const lightingBySlot = {
        left: cell.leftLighting
          ? clampBoothParticipantLighting(cell.leftLighting)
          : measuredLighting.participantA,
        right: cell.rightLighting
          ? clampBoothParticipantLighting(cell.rightLighting)
          : measuredLighting.participantB,
      };

      const leftBounds = leftImg
        ? (cell.leftBounds ?? await measureImageAlphaBounds(leftImg))
        : null;
      const rightBounds = rightImg
        ? (cell.rightBounds ?? await measureImageAlphaBounds(rightImg))
        : null;
      const spanMode = layout.sceneSpanMode ?? sceneSpanMode;
      const leftSubjectId = cell.leftSubjectId ?? 'left';
      const rightSubjectId = cell.rightSubjectId ?? 'right';
      const placements = cell.placementsBySubjectId ?? null;
      const useAbsolute = placements != null;

      const frontHome: SameSpaceCompositionSlot = useAbsolute && cell.frontSubjectId
        ? (cell.frontSubjectId === rightSubjectId ? 'right' : 'left')
        : (cell.frontSlot ?? DEFAULT_SAME_SPACE_FRONT);
      const drawOrder = createParticipantStageLayers(['left', 'right'], frontHome)
        .map((layer) => layer.participantId as SameSpaceCompositionSlot);

      for (const slot of drawOrder) {
        const img = images[slot];
        if (!img) continue;
        const subjectId = slot === 'left' ? leftSubjectId : rightSubjectId;
        const placement = placements?.[subjectId] ?? { mode: 'auto' as const, rect: null };
        const bounds = slot === 'left' ? leftBounds : rightBounds;
        const resolved = resolveSubjectDrawRect({
          frameWidth: sceneWidth,
          frameHeight: sceneHeight,
          placement,
          alphaBounds: bounds,
          sourceWidth: img.naturalWidth || img.width,
          sourceHeight: img.naturalHeight || img.height,
          homeSlot: slot,
          soloLayout: cell.soloLayout ?? 'half',
          participantCount: Math.max(1, participantCount),
          spanMode,
          autoPacking: leftBounds && rightBounds
            ? {
              leftBounds,
              rightBounds,
              leftManual: cell.leftManualOffset ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
              rightManual: cell.rightManualOffset ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
              slotManual: slot === 'left'
                ? (cell.leftManualOffset ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET)
                : (cell.rightManualOffset ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET),
            }
            : null,
        });
        ctx.save();
        ctx.filter = boothParticipantLightingFilter(lightingBySlot[slot]);
        drawImageMaybeMirrored(
          ctx,
          img,
          0,
          0,
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
          row.leftX + resolved.dest.x,
          row.y + resolved.dest.y,
          resolved.dest.width,
          resolved.dest.height,
          slot === 'left' ? cell.leftMirror : cell.rightMirror,
        );
        ctx.restore();
      }
      const cellCompanions = cell.companions ?? companions;
      await preloadBoothCompanions(cellCompanions);
      ctx.save();
      ctx.translate(row.leftX, row.y);
      drawBoothCompanions(ctx, sceneWidth, sceneHeight, cellCompanions);
      ctx.restore();
      sharedSceneForegrounds.push({
        x: row.leftX,
        y: row.y,
        width: sceneWidth,
        height: sceneHeight,
        sceneId: cell.sharedSceneId ?? 'classic',
        roomFrontPlate,
      });
      ctx.restore();
      continue;
    }

    ctx.fillStyle = '#E8E0F0';
    roundRect(ctx, row.leftX, row.y, layout.cellWidth, layout.cellHeight, 8);
    ctx.fill();
    if (cell?.hostUri) {
      const img = await loadImage(cell.hostUri);
      ctx.save();
      roundRect(ctx, row.leftX, row.y, layout.cellWidth, layout.cellHeight, 8);
      ctx.clip();
      drawCover(ctx, img, row.leftX, row.y, layout.cellWidth, layout.cellHeight, cell.transform, cell.hostMirror);
      ctx.restore();
    }

    ctx.fillStyle = '#E8E0F0';
    roundRect(ctx, row.rightX, row.y, layout.cellWidth, layout.cellHeight, 8);
    ctx.fill();
    if (cell?.guestUri) {
      const img = await loadImage(cell.guestUri);
      ctx.save();
      roundRect(ctx, row.rightX, row.y, layout.cellWidth, layout.cellHeight, 8);
      ctx.clip();
      drawCover(ctx, img, row.rightX, row.y, layout.cellWidth, layout.cellHeight, cell.transform, cell.guestMirror);
      ctx.restore();
    }
  }

  // Canonical foreground sits above participants and optional companions.
  for (const foreground of sharedSceneForegrounds) {
    ctx.save();
    roundRect(ctx, foreground.x, foreground.y, foreground.width, foreground.height, 8);
    ctx.clip();
    ctx.translate(foreground.x, foreground.y);
    renderBoothSharedSceneForeground(
      ctx,
      foreground.width,
      foreground.height,
      foreground.sceneId,
      foreground.roomFrontPlate,
    );
    ctx.restore();
  }

  ctx.fillStyle = frame.ink;
  ctx.font = '700 22px Outfit, system-ui, sans-serif';
  ctx.fillText(dateLabel, layout.width / 2, layout.dateY);

  ctx.fillStyle = frame.ink;
  ctx.globalAlpha = 0.72;
  ctx.font = '400 18px Outfit, system-ui, sans-serif';
  ctx.fillText('together, anywhere', layout.width / 2, layout.taglineY);
  ctx.globalAlpha = 1;

  const filtered = colorMode === 'color'
    ? canvas
    : applyBoothColorModeToCanvas(canvas, colorMode);

  const blob = await new Promise<Blob>((resolve, reject) => {
    filtered.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('FINAL_JPEG_ENCODE_FAILED'))),
      'image/jpeg',
      FINAL_JPEG_QUALITY,
    );
  });
  return URL.createObjectURL(blob);
}
