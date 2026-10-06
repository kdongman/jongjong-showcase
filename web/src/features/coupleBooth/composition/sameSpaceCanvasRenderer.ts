import type { SameSpaceBackground } from '@shared/sameSpaceBackground';
import { DEFAULT_SAME_SPACE_BACKGROUND, normalizeHexColor } from '@shared/sameSpaceBackground';
import { renderSameSpaceBackgroundPreset } from '@shared/sameSpaceBackgroundPresets';
import {
  computeSameSpacePersonPlacement,
  type SameSpaceNormalizedTransform,
  type SameSpacePersonBounds,
} from '@shared/sameSpaceComposition';
import {
  DEFAULT_BOOTH_SCENE_SPAN_MODE,
  type BoothSceneSpanMode,
} from '@shared/boothSceneSpec';
import {
  DEFAULT_SAME_SPACE_FRONT,
  DEFAULT_SAME_SPACE_MANUAL_OFFSET,
  type SameSpaceCompositionSlot,
  type SameSpaceFrontPreference,
  type SameSpaceManualOffset,
  type SameSpaceSoloLayout,
} from '@shared/sameSpaceLayoutSpec';
import { createParticipantStageLayers } from '@shared/coupleBoothStage';
import {
  boothSharedSceneDefinition,
  type BoothSharedSceneId,
  type BoothSharedScenePaint,
} from '@shared/sharedScene';
import type { LiveSegmentResult } from '../segmentation/LivePersonSegmenter';
import type { BoothCompanionSnapshot } from '@shared/coupleBoothStage';
import { drawBoothCompanions } from './boothCompanionCanvas';
import { decontaminateForegroundEdge } from '../segmentation/foregroundEdgeCleanup';
import {
  boothParticipantLightingFilter,
  type BoothParticipantLighting,
} from '@shared/participantLighting';

export type SegmentedSourceOutput = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  rgbCanvas: HTMLCanvasElement;
  rgbContext: CanvasRenderingContext2D;
  alphaCanvas: HTMLCanvasElement;
  alphaContext: CanvasRenderingContext2D;
  generation: number;
  /** Monotonic commit counter (may rise on identical pixels in older paths). */
  revision: number;
  /** Increments only when sampled pixel content actually changes. */
  contentRevision: number;
  contentChecksum: number;
  lastPixelWriteAtMs: number;
  lastValidAtMs: number;
};

const sharedSceneBackgroundCache = new Map<string, HTMLCanvasElement>();

export type SameSpacePersonLayer = {
  slot: SameSpaceCompositionSlot;
  /** @deprecated Use slot. */
  role?: SameSpaceCompositionSlot | 'host' | 'guest';
  /** A completed source-owned, alpha-masked canvas. Never a raw video frame. */
  output: SegmentedSourceOutput | null;
  bounds: SameSpacePersonBounds | null;
  sourceWidth: number;
  sourceHeight: number;
  /** Locked/EMA person height for fit scale (live bbox noise must not zoom). */
  fitPersonHeightNorm?: number | null;
  /** Skip edge-touch scale damp after fit scale is locked. */
  disableEdgeScaleDamp?: boolean;
  transform?: SameSpaceNormalizedTransform | null;
  mirrorDisplay: boolean;
  lighting?: BoothParticipantLighting | null;
  /**
   * Mild automatic centroid assist (≈3–8% stage). Camera-internal motion
   * already lives inside the sprite — do not re-map across the whole stage.
   */
  motionOffsetX?: number;
  /** Authoritative manual drag offset (persisted). Separate from centroid assist. */
  manualOffset?: SameSpaceManualOffset | null;
  /**
   * DEV debug only. Production must never set this — composite never paints
   * opaque rectangular source video for end users.
   */
  rawVideo?: CanvasImageSource | null;
  /** DEV debug only — ignored unless allowDebugRawVideo is true. */
  preferRawVideo?: boolean;
  /** Gate for raw video draw path (DEV + sameSpaceDebug). */
  allowDebugRawVideo?: boolean;
  /** Warm-up placeholder before the first cutout commit. */
  showLoadingSilhouette?: boolean;
  /** Long-stale cutout: keep last FG and hint reconnecting. */
  showReconnecting?: boolean;
};

/** Soft stale window — keep last cutout, do not switch to raw video. */
export const SAME_SPACE_FOREGROUND_STALE_MS = 400;
/** After this age, keep last cutout and show reconnecting while pumps recover. */
export const SAME_SPACE_FOREGROUND_RECONNECTING_MS = 1000;

export function isForegroundStale(lastValidAtMs: number, nowMs: number, limitMs = SAME_SPACE_FOREGROUND_STALE_MS): boolean {
  if (!(lastValidAtMs > 0)) return true;
  return nowMs - lastValidAtMs >= limitMs;
}

export function isForegroundReconnecting(
  lastValidAtMs: number,
  nowMs: number,
  limitMs = SAME_SPACE_FOREGROUND_RECONNECTING_MS,
): boolean {
  if (!(lastValidAtMs > 0)) return false;
  return nowMs - lastValidAtMs >= limitMs;
}

/** True only when DEV debug explicitly opts into painting raw source video. */
export function canDrawSameSpaceRawVideo(layer: Pick<SameSpacePersonLayer, 'allowDebugRawVideo' | 'preferRawVideo' | 'rawVideo'>): boolean {
  return Boolean(layer.allowDebugRawVideo && layer.preferRawVideo && layer.rawVideo);
}

export type SameSpaceBackgroundImageCache = {
  presetId: string;
  url: string;
  image: CanvasImageSource | null;
};

export function createSegmentedSourceOutput(generation = 0): SegmentedSourceOutput | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const rgbCanvas = document.createElement('canvas');
  const rgbContext = rgbCanvas.getContext('2d');
  const alphaCanvas = document.createElement('canvas');
  const alphaContext = alphaCanvas.getContext('2d');
  if (!context || !rgbContext || !alphaContext) return null;
  return {
    canvas,
    context,
    rgbCanvas,
    rgbContext,
    alphaCanvas,
    alphaContext,
    generation,
    revision: 0,
    contentRevision: 0,
    contentChecksum: 0,
    lastPixelWriteAtMs: 0,
    lastValidAtMs: 0,
  };
}

/** Sampled checksum so tests can prove canvas pixels changed — not version alone. */
export function computeForegroundContentChecksum(rgb: ImageData, alpha: Uint8ClampedArray): number {
  const data = rgb.data;
  const len = Math.min(data.length, alpha.length * 4);
  let hash = 2166136261;
  const step = Math.max(4, ((len / 64) | 0) * 4 || 4);
  for (let i = 0; i < len; i += step) {
    hash ^= data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16) | (alpha[(i / 4) | 0]! << 24);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= rgb.width;
  hash ^= rgb.height << 16;
  return hash >>> 0;
}

/**
 * Atomically replace one source's final output with its matching RGB and alpha.
 * The final canvas is committed only after a valid segmentation result exists.
 * revision/contentRevision rise only after pixels are written.
 */
export function commitSegmentedSourceOutput(
  output: SegmentedSourceOutput,
  result: LiveSegmentResult,
  expectedGeneration = output.generation,
): boolean {
  if (output.generation !== expectedGeneration) return false;
  if (!result.mask.valid || !result.mask.bounds) return false;
  const { inferWidth: width, inferHeight: height } = result;
  if (result.rgb.width !== width || result.rgb.height !== height) return false;

  const checksum = computeForegroundContentChecksum(result.rgb, result.mask.alpha);
  // Identical decode: keep last good pixels, do not fake a new commit.
  if (output.revision > 0 && checksum === output.contentChecksum) {
    output.lastValidAtMs = performance.now();
    return false;
  }

  for (const canvas of [output.canvas, output.rgbCanvas, output.alphaCanvas]) {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  // Must use context.createImageData — browsers reject plain-object "ImageData"
  // casts in putImageData, which previously aborted every commit and left
  // Same Space stuck on warm-up silhouettes.
  const cleaned = output.rgbContext.createImageData(width, height);
  cleaned.data.set(result.rgb.data);
  decontaminateForegroundEdge(cleaned, result.mask.alpha);

  output.rgbContext.globalCompositeOperation = 'source-over';
  output.rgbContext.clearRect(0, 0, width, height);
  try {
    output.rgbContext.putImageData(cleaned, 0, 0);
  } catch (error) {
    console.error('[same-space][commit] rgb putImageData failed', error);
    return false;
  }

  const alpha = output.alphaContext.createImageData(width, height);
  for (let i = 0; i < result.mask.alpha.length; i += 1) alpha.data[i * 4 + 3] = result.mask.alpha[i]!;
  output.alphaContext.globalCompositeOperation = 'source-over';
  output.alphaContext.clearRect(0, 0, width, height);
  try {
    output.alphaContext.putImageData(alpha, 0, 0);
  } catch (error) {
    console.error('[same-space][commit] alpha putImageData failed', error);
    return false;
  }

  const ctx = output.context;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);
  // Transparent clear — never composite over an opaque white matte.
  ctx.drawImage(output.rgbCanvas, 0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(output.alphaCanvas, 0, 0, width, height);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';

  const now = performance.now();
  output.contentChecksum = checksum;
  output.contentRevision += 1;
  output.revision += 1;
  output.lastPixelWriteAtMs = now;
  output.lastValidAtMs = now;
  return true;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  objectFit: 'cover' | 'contain',
  positionX: number,
  positionY: number,
): void {
  const iw = 'naturalWidth' in image && typeof image.naturalWidth === 'number' && image.naturalWidth > 0
    ? image.naturalWidth
    : 'width' in image && typeof image.width === 'number'
      ? Number(image.width)
      : width;
  const ih = 'naturalHeight' in image && typeof image.naturalHeight === 'number' && image.naturalHeight > 0
    ? image.naturalHeight
    : 'height' in image && typeof image.height === 'number'
      ? Number(image.height)
      : height;
  const scale = objectFit === 'contain'
    ? Math.min(width / iw, height / ih)
    : Math.max(width / iw, height / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (width - dw) * Math.min(1, Math.max(0, positionX));
  const dy = (height - dh) * Math.min(1, Math.max(0, positionY));
  ctx.drawImage(image, dx, dy, dw, dh);
}

export function renderSameSpaceBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: SameSpaceBackground = DEFAULT_SAME_SPACE_BACKGROUND,
  imageCache?: SameSpaceBackgroundImageCache | null,
): void {
  if (background.type === 'preset') {
    renderSameSpaceBackgroundPreset(ctx, width, height, background.key);
    return;
  }
  if (background.type === 'original') {
    renderSameSpaceBackgroundPreset(ctx, width, height, 'studio_lavender');
    return;
  }
  if (background.type === 'gradient') {
    const angle = ((background.angleDeg ?? 135) * Math.PI) / 180;
    const x0 = width / 2 - (Math.cos(angle) * width) / 2;
    const y0 = height / 2 - (Math.sin(angle) * height) / 2;
    const x1 = width / 2 + (Math.cos(angle) * width) / 2;
    const y1 = height / 2 + (Math.sin(angle) * height) / 2;
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, normalizeHexColor(background.from));
    gradient.addColorStop(1, normalizeHexColor(background.to));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    // Shared ambient wash for legacy gradient backgrounds.
    const wash = ctx.createRadialGradient(
      width * 0.5,
      height * 0.42,
      Math.min(width, height) * 0.08,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    wash.addColorStop(0, 'rgba(255,255,255,0.12)');
    wash.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  if (background.type === 'image') {
    const image = imageCache?.image
      && imageCache.presetId === background.presetId
      && imageCache.url === (background.url ?? '')
      ? imageCache.image
      : null;
    if (image) {
      ctx.save();
      if (background.blurPx && background.blurPx > 0) {
        ctx.filter = `blur(${background.blurPx}px)`;
      }
      drawCoverImage(
        ctx,
        image,
        width,
        height,
        background.objectFit ?? 'cover',
        background.positionX ?? 0.5,
        background.positionY ?? 0.5,
      );
      ctx.restore();
      if (background.darken && background.darken > 0) {
        ctx.fillStyle = `rgba(0,0,0,${background.darken})`;
        ctx.fillRect(0, 0, width, height);
      }
      return;
    }
    renderSameSpaceBackgroundPreset(ctx, width, height, 'studio_lavender');
    return;
  }
  // Legacy solid — keep soft shared lighting (no per-person shadows).
  const base = normalizeHexColor(background.color, '#F7F2FA');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  const wash = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    Math.min(width, height) * 0.08,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72,
  );
  wash.addColorStop(0, 'rgba(255,255,255,0.14)');
  wash.addColorStop(0.55, 'rgba(255,255,255,0.03)');
  wash.addColorStop(1, 'rgba(40,28,55,0.06)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
  const floor = ctx.createLinearGradient(0, height * 0.72, 0, height);
  floor.addColorStop(0, 'rgba(40,28,55,0)');
  floor.addColorStop(1, 'rgba(40,28,55,0.10)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, width, height);
}

/** Shared normalized scene paint used by live, review/editor, and final export. */
export function renderBoothSharedScenePaint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  paint: BoothSharedScenePaint,
): void {
  const minDimension = Math.min(width, height);
  ctx.save();
  ctx.globalAlpha = paint.opacity ?? 1;

  if (paint.kind === 'line') {
    ctx.strokeStyle = paint.stroke;
    ctx.lineWidth = Math.max(1, minDimension * paint.strokeWidth);
    ctx.beginPath();
    ctx.moveTo(paint.from.x * width, paint.from.y * height);
    ctx.lineTo(paint.to.x * width, paint.to.y * height);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (paint.kind === 'ellipse') {
    ctx.fillStyle = paint.fill;
    ctx.beginPath();
    ctx.ellipse(
      paint.center.x * width,
      paint.center.y * height,
      paint.radiusX * width,
      paint.radiusY * height,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    if (paint.stroke) {
      ctx.strokeStyle = paint.stroke;
      ctx.lineWidth = Math.max(1, minDimension * (paint.strokeWidth ?? 0.002));
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const rect = paint.rect;
  const x = rect.x * width;
  const y = rect.y * height;
  const rectWidth = rect.width * width;
  const rectHeight = rect.height * height;

  if (paint.kind === 'linear-gradient') {
    const gradient = ctx.createLinearGradient(
      paint.from.x * width,
      paint.from.y * height,
      paint.to.x * width,
      paint.to.y * height,
    );
    for (const stop of paint.stops) gradient.addColorStop(stop.offset, stop.color);
    ctx.fillStyle = gradient;
  } else if (paint.kind === 'radial-gradient') {
    const gradient = ctx.createRadialGradient(
      paint.center.x * width,
      paint.center.y * height,
      paint.innerRadius * minDimension,
      paint.center.x * width,
      paint.center.y * height,
      paint.outerRadius * Math.max(width, height),
    );
    for (const stop of paint.stops) gradient.addColorStop(stop.offset, stop.color);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = paint.fill;
  }
  ctx.fillRect(x, y, rectWidth, rectHeight);
  if (paint.kind === 'rect' && paint.stroke) {
    ctx.strokeStyle = paint.stroke;
    ctx.lineWidth = Math.max(1, minDimension * (paint.strokeWidth ?? 0.002));
    ctx.strokeRect(x, y, rectWidth, rectHeight);
  }
  ctx.restore();
}

export function renderBoothSharedSceneBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sceneId: BoothSharedSceneId | string | null | undefined,
  fallbackBackground: SameSpaceBackground = DEFAULT_SAME_SPACE_BACKGROUND,
  imageCache?: SameSpaceBackgroundImageCache | null,
): void {
  const scene = boothSharedSceneDefinition(sceneId);
  if (scene.useExistingBackground) {
    renderSameSpaceBackground(ctx, width, height, fallbackBackground, imageCache);
    return;
  }

  const paintBackground = (target: CanvasRenderingContext2D) => {
    target.fillStyle = scene.backgroundColor ?? '#F7F2FA';
    target.fillRect(0, 0, width, height);
    for (const paint of scene.backgroundDecoration) {
      renderBoothSharedScenePaint(target, width, height, paint);
    }
  };

  // Static V1 scene art is cached by canonical backing-store size so the
  // 30fps live compositor does not recreate gradients on every frame.
  if (typeof document !== 'undefined') {
    const key = `${scene.id}:${width}x${height}`;
    let cached = sharedSceneBackgroundCache.get(key);
    if (!cached) {
      cached = document.createElement('canvas');
      cached.width = width;
      cached.height = height;
      const cachedCtx = cached.getContext('2d');
      if (!cachedCtx) {
        paintBackground(ctx);
        return;
      }
      paintBackground(cachedCtx);
      sharedSceneBackgroundCache.set(key, cached);
      if (sharedSceneBackgroundCache.size > 12) {
        const oldest = sharedSceneBackgroundCache.keys().next().value as string | undefined;
        if (oldest) sharedSceneBackgroundCache.delete(oldest);
      }
    }
    ctx.drawImage(cached, 0, 0, width, height);
    return;
  }
  paintBackground(ctx);
}

export function renderBoothSharedSceneForeground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sceneId: BoothSharedSceneId | string | null | undefined,
  roomFrontPlate?: CanvasImageSource | null,
): void {
  const scene = boothSharedSceneDefinition(sceneId);
  for (const paint of scene.foregroundElements) {
    renderBoothSharedScenePaint(ctx, width, height, paint);
  }
  if (roomFrontPlate) ctx.drawImage(roomFrontPlate, 0, 0, width, height);
}

export function drawSameSpacePersonLayer(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  layer: SameSpacePersonLayer,
  options?: {
    soloLayout?: SameSpaceSoloLayout;
    participantCount?: number;
    spanMode?: BoothSceneSpanMode;
  },
): void {
  const output = layer.output;
  const hasForeground = Boolean(
    output && output.revision > 0 && output.canvas.width > 0 && output.canvas.height > 0,
  );
  // Production never paints raw rectangular video. DEV debug must set
  // allowDebugRawVideo explicitly.
  const useRaw = canDrawSameSpaceRawVideo(layer);
  if (!hasForeground && !useRaw && !layer.showLoadingSilhouette) return;

  const sourceWidth = Math.max(1, layer.sourceWidth
    || (useRaw && layer.rawVideo && 'videoWidth' in layer.rawVideo ? Number(layer.rawVideo.videoWidth) || 0 : 0)
    || (hasForeground ? output!.canvas.width : 0)
    || 640);
  const sourceHeight = Math.max(1, layer.sourceHeight
    || (useRaw && layer.rawVideo && 'videoHeight' in layer.rawVideo ? Number(layer.rawVideo.videoHeight) || 0 : 0)
    || (hasForeground ? output!.canvas.height : 0)
    || 480);

  const slot = layer.slot
    ?? (layer.role === 'right' || layer.role === 'guest' ? 'right' : 'left');
  const placement = computeSameSpacePersonPlacement({
    canvasWidth,
    canvasHeight,
    sourceWidth,
    sourceHeight,
    personBounds: layer.bounds,
    fitPersonHeightNorm: layer.fitPersonHeightNorm,
    disableEdgeScaleDamp: layer.disableEdgeScaleDamp,
    normalizedTransform: layer.transform,
    manualOffset: layer.manualOffset ?? DEFAULT_SAME_SPACE_MANUAL_OFFSET,
    slot,
    soloLayout: options?.soloLayout,
    participantCount: options?.participantCount,
    motionOffsetX: layer.motionOffsetX ?? 0,
    spanMode: options?.spanMode ?? DEFAULT_BOOTH_SCENE_SPAN_MODE,
  });

  if (!hasForeground && !useRaw && layer.showLoadingSilhouette) {
    drawLoadingSilhouette(ctx, placement.personDest);
    return;
  }

  // Never clip to a left/right half — destination may cross the midline.
  const drawSource = useRaw && layer.rawVideo
    ? layer.rawVideo
    : output!.canvas;
  const drawW = useRaw && layer.rawVideo && 'videoWidth' in layer.rawVideo && Number(layer.rawVideo.videoWidth) > 0
    ? Number(layer.rawVideo.videoWidth)
    : hasForeground
      ? output!.canvas.width
      : sourceWidth;
  const drawH = useRaw && layer.rawVideo && 'videoHeight' in layer.rawVideo && Number(layer.rawVideo.videoHeight) > 0
    ? Number(layer.rawVideo.videoHeight)
    : hasForeground
      ? output!.canvas.height
      : sourceHeight;

  // Full-frame sourceCrop — bbox never crops the stable FG canvas.
  const sx = useRaw
    ? (placement.sourceCrop.x / sourceWidth) * drawW
    : (placement.sourceCrop.x / Math.max(1, layer.sourceWidth || sourceWidth)) * drawW;
  const sy = useRaw
    ? (placement.sourceCrop.y / sourceHeight) * drawH
    : (placement.sourceCrop.y / Math.max(1, layer.sourceHeight || sourceHeight)) * drawH;
  const sw = Math.max(1, useRaw
    ? (placement.sourceCrop.width / sourceWidth) * drawW
    : (placement.sourceCrop.width / Math.max(1, layer.sourceWidth || sourceWidth)) * drawW);
  const sh = Math.max(1, useRaw
    ? (placement.sourceCrop.height / sourceHeight) * drawH
    : (placement.sourceCrop.height / Math.max(1, layer.sourceHeight || sourceHeight)) * drawH);

  // No per-person ground ellipse — depth comes from the shared background wash only.
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = boothParticipantLightingFilter(layer.lighting);
  if (layer.mirrorDisplay) {
    ctx.translate(placement.dest.x + placement.dest.width, placement.dest.y);
    ctx.scale(-1, 1);
    ctx.drawImage(drawSource, sx, sy, sw, sh, 0, 0, placement.dest.width, placement.dest.height);
  } else {
    ctx.drawImage(drawSource, sx, sy, sw, sh, placement.dest.x, placement.dest.y, placement.dest.width, placement.dest.height);
  }
  ctx.restore();

  if (layer.showReconnecting && hasForeground && !useRaw) {
    drawReconnectingHint(ctx, placement.personDest);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawLoadingSilhouette(
  ctx: CanvasRenderingContext2D,
  dest: { x: number; y: number; width: number; height: number },
): void {
  // Soft warm-up cue only — avoid large grey body icons that look like failures.
  const cx = dest.x + dest.width / 2;
  const cy = dest.y + dest.height * 0.55;
  const rx = Math.max(10, dest.width * 0.08);
  const ry = Math.max(14, dest.height * 0.12);
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#6B5F7A';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawReconnectingHint(
  ctx: CanvasRenderingContext2D,
  dest: { x: number; y: number; width: number; height: number },
): void {
  const label = '다시 연결 중…';
  const fontSize = Math.max(11, Math.round(dest.height * 0.045));
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(20, 14, 28, 0.55)';
  const padX = Math.max(8, dest.width * 0.08);
  const padY = Math.max(4, dest.height * 0.02);
  const textW = Math.min(dest.width * 0.9, fontSize * 7.5);
  const boxX = dest.x + (dest.width - textW) / 2 - padX / 2;
  const boxY = dest.y + dest.height * 0.72;
  ctx.fillRect(boxX, boxY, textW + padX, fontSize + padY * 2);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#FFF8FF';
  ctx.font = `600 ${fontSize}px Outfit, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, dest.x + dest.width / 2, boxY + (fontSize + padY * 2) / 2);
  ctx.restore();
}

export function renderSameSpaceCompositionFrame(input: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  background?: SameSpaceBackground;
  backgroundImage?: SameSpaceBackgroundImageCache | null;
  foregroundImage?: CanvasImageSource | null;
  sharedSceneId?: BoothSharedSceneId;
  left: SameSpacePersonLayer;
  right: SameSpacePersonLayer;
  /** @deprecated Prefer left/right. */
  host?: SameSpacePersonLayer;
  /** @deprecated Prefer left/right. */
  guest?: SameSpacePersonLayer;
  frontSlot?: SameSpaceFrontPreference;
  soloLayout?: SameSpaceSoloLayout;
  spanMode?: BoothSceneSpanMode;
  showWaitingHint?: boolean;
  companions?: BoothCompanionSnapshot[];
}): void {
  const { ctx, width, height } = input;
  const left = input.left ?? input.host;
  const right = input.right ?? input.guest;
  if (!left || !right) return;

  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  renderBoothSharedSceneBackground(
    ctx,
    width,
    height,
    input.sharedSceneId ?? 'classic',
    input.background ?? DEFAULT_SAME_SPACE_BACKGROUND,
    input.backgroundImage,
  );

  const leftPresent = Boolean(
    (left.output && left.output.revision > 0)
    || left.showLoadingSilhouette
    || canDrawSameSpaceRawVideo(left),
  );
  const rightPresent = Boolean(
    (right.output && right.output.revision > 0)
    || right.showLoadingSilhouette
    || canDrawSameSpaceRawVideo(right),
  );
  const participantCount = (leftPresent ? 1 : 0) + (rightPresent ? 1 : 0);

  const layersBySlot: Record<SameSpaceCompositionSlot, SameSpacePersonLayer> = {
    left: { ...left, slot: 'left' },
    right: { ...right, slot: 'right' },
  };

  const participantLayers = createParticipantStageLayers(
    ['left', 'right'],
    input.frontSlot ?? DEFAULT_SAME_SPACE_FRONT,
  );
  for (const stageLayer of participantLayers) {
    const slot = stageLayer.participantId as SameSpaceCompositionSlot;
    drawSameSpacePersonLayer(ctx, width, height, layersBySlot[slot], {
      soloLayout: input.soloLayout,
      participantCount: Math.max(1, participantCount),
      spanMode: input.spanMode ?? DEFAULT_BOOTH_SCENE_SPAN_MODE,
    });
  }

  drawBoothCompanions(ctx, width, height, input.companions ?? []);

  renderBoothSharedSceneForeground(ctx, width, height, input.sharedSceneId ?? 'classic', input.foregroundImage);

  if (input.showWaitingHint && participantCount === 1) {
    // Stage-top status — never cover the person footprint.
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(255, 248, 255, 0.72)';
    const boxH = Math.max(28, Math.round(height * 0.06));
    ctx.fillRect(width * 0.18, height * 0.04, width * 0.64, boxH);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#332E3D';
    ctx.font = `600 ${Math.max(12, Math.round(height * 0.032))}px Outfit, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('상대를 기다리고 있어요', width * 0.5, height * 0.04 + boxH / 2);
    ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
}
