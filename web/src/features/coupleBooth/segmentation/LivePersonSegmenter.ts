import { processSegmentationMask, type ProcessedMask } from './maskProcessing';
import { createSerializedScheduler, nextMonotonicTimestamp } from './segmentScheduler';

const viteEnv = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
const BASE_URL = String(viteEnv?.BASE_URL ?? '/').replace(/\/?$/, '/');
const ASSET_ROOT = `${BASE_URL}mediapipe`;
const WASM = `${ASSET_ROOT}/wasm`;
const MODEL = `${ASSET_ROOT}/selfie_segmenter_landscape.tflite`;

type VisionModule = typeof import('@mediapipe/tasks-vision');
type SourceKey = 'local' | 'remote' | 'still';

let visionPromise: Promise<VisionModule> | null = null;
/** Single shared VIDEO-mode segmenter for local+remote (serialized). */
let segmenterPromise: Promise<any> | null = null;
let segmenterInstance: { close?: () => void } | null = null;
let lastVideoTimestamp = -1;
let retainCount = 0;
/** Replaceable so a wedged inference chain can be abandoned safely. */
let scheduler = createSerializedScheduler();

/** Per-source downscale buffers — never share mutable scratch across participants. */
const downscaleBySource = new Map<SourceKey, {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}>();

export const LIVE_SEGMENT_LONG_EDGE = 320;
export const LIVE_SEGMENT_TARGET_FPS = 10;

export type LiveSegmentResult = {
  mask: ProcessedMask;
  /** RGB pixels from exactly the frame submitted to ImageSegmenter. */
  rgb: ImageData;
  sourceWidth: number;
  sourceHeight: number;
  inferWidth: number;
  inferHeight: number;
  sourceKey: SourceKey;
};

export function liveSegmenterAssetPaths(): { wasm: string; model: string } {
  return { wasm: WASM, model: MODEL };
}

async function getVision(): Promise<VisionModule> {
  if (!visionPromise) visionPromise = import('@mediapipe/tasks-vision');
  return visionPromise;
}

async function createSegmenter(): Promise<any> {
  const vision = await getVision();
  const files = await vision.FilesetResolver.forVisionTasks(WASM);
  const segmenter = await vision.ImageSegmenter.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL },
    runningMode: 'VIDEO',
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
  segmenterInstance = segmenter;
  lastVideoTimestamp = -1;
  return segmenter;
}

async function getLiveSegmenter(): Promise<any> {
  if (!segmenterPromise) {
    segmenterPromise = createSegmenter().catch((error) => {
      segmenterPromise = null;
      segmenterInstance = null;
      throw error;
    });
  }
  return segmenterPromise;
}

function getDownscale(sourceKey: SourceKey): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const existing = downscaleBySource.get(sourceKey);
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const entry = { canvas, ctx };
  downscaleBySource.set(sourceKey, entry);
  return entry;
}

function drawDownscaled(
  sourceKey: SourceKey,
  video: HTMLVideoElement,
): { width: number; height: number; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const entry = getDownscale(sourceKey);
  if (!entry) return null;
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  const scale = Math.min(1, LIVE_SEGMENT_LONG_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  if (entry.canvas.width !== width || entry.canvas.height !== height) {
    entry.canvas.width = width;
    entry.canvas.height = height;
  }
  entry.ctx.globalCompositeOperation = 'source-over';
  entry.ctx.clearRect(0, 0, width, height);
  entry.ctx.drawImage(video, 0, 0, width, height);
  return { width, height, canvas: entry.canvas, ctx: entry.ctx };
}

/** Retain shared segmenter across Same Space ON/OFF toggles without duplicate creates. */
export async function ensureLiveSegmenterReady(): Promise<void> {
  retainCount += 1;
  try {
    await getLiveSegmenter();
  } catch (error) {
    retainCount = Math.max(0, retainCount - 1);
    throw error;
  }
}

export function releaseLiveSegmenter(): void {
  retainCount = Math.max(0, retainCount - 1);
}

/** Hard reset after fatal asset/init failure so Retry can recreate once. */
export function disposeLiveSegmenter(): void {
  try {
    segmenterInstance?.close?.();
  } catch {
    /* ignore */
  }
  segmenterInstance = null;
  segmenterPromise = null;
  lastVideoTimestamp = -1;
  retainCount = 0;
  downscaleBySource.clear();
}

/**
 * Run one VIDEO inference. Local and remote share one ImageSegmenter;
 * calls are serialized and timestamps are strictly monotonic per instance.
 * Each source owns a dedicated downscale canvas so RGB/mask never cross-contaminate.
 */
export function segmentVideoFrame(
  video: HTMLVideoElement,
  sourceKey: SourceKey = 'local',
): Promise<LiveSegmentResult | null> {
  return scheduler.run(async () => {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (sourceWidth <= 0 || sourceHeight <= 0) return null;
    const sized = drawDownscaled(sourceKey, video);
    if (!sized) return null;
    // Preserve this inference's source frame from its own canvas before any later overwrite.
    const rgb = sized.ctx.getImageData(0, 0, sized.width, sized.height);
    if (!rgb) return null;

    const segmenter = await getLiveSegmenter();
    const timestampMs = nextMonotonicTimestamp(lastVideoTimestamp, performance.now());
    lastVideoTimestamp = timestampMs;

    let result: any;
    try {
      result = segmenter.segmentForVideo(sized.canvas, timestampMs);
    } catch (error) {
      throw error;
    }

    try {
      const confidence = result.confidenceMasks?.[0];
      if (!confidence) return null;
      let values: Float32Array | Uint8Array;
      let isConfidence = true;
      try {
        values = confidence.getAsFloat32Array();
      } catch {
        values = confidence.getAsUint8Array();
        isConfidence = false;
      }
      const mask = processSegmentationMask({
        values,
        width: sized.width,
        height: sized.height,
        isConfidence,
      });
      confidence.close?.();
      return {
        mask,
        rgb,
        sourceWidth,
        sourceHeight,
        inferWidth: sized.width,
        inferHeight: sized.height,
        sourceKey,
      };
    } finally {
      result?.close?.();
    }
  });
}

/** Test seam — true while a shared inference is running or queued. */
export function isLiveSegmenterInFlight(): boolean {
  return scheduler.busy;
}

export function getLiveSegmenterBusyAgeMs(): number {
  return scheduler.busyAgeMs;
}

export const LIVE_SEGMENTER_BUSY_STUCK_MS = 1500;

/**
 * Recreate the shared ImageSegmenter when inference appears wedged.
 * Keeps retain count and last foreground canvases; does not remount the stage.
 */
export async function recreateLiveSegmenterIfStuck(
  stuckAfterMs = LIVE_SEGMENTER_BUSY_STUCK_MS,
): Promise<boolean> {
  if (scheduler.busyAgeMs < stuckAfterMs) return false;
  const retain = Math.max(1, retainCount);
  try {
    segmenterInstance?.close?.();
  } catch {
    /* ignore */
  }
  segmenterInstance = null;
  segmenterPromise = null;
  lastVideoTimestamp = -1;
  downscaleBySource.clear();
  // Abandon any hung inference promise chain.
  scheduler = createSerializedScheduler();
  retainCount = retain;
  await getLiveSegmenter();
  return true;
}
