/**
 * Authoritative Same Space capture:
 * 1) Wait until the visible compositor has drawn the requested generations
 *    (WYSIWYG timing / pose gate).
 * 2) Snapshot the live composite for the shot JPEG preview URI.
 * 3) Build the Review/export cutout from a full-resolution video frame via
 *    one-shot IMAGE segmentation — never persist the live 320px preview canvas.
 */

import { captureHighResPersonCutoutFromVideo } from './highResCutoutCapture';
import { getCaptureFrameDimensions, type CaptureViewportMode } from '@shared/boothSceneSpec';


export type SameSpaceSourceVersions = {
  localCommitVersion: number;
  remoteCommitVersion: number;
};

export type SameSpaceCompositorDrawState = {
  localDrawnVersion: number;
  remoteDrawnVersion: number;
  /** Monotonic composite frame counter (increments every successful draw). */
  compositeGeneration: number;
  lastFrameTimeMs: number;
};

export type SameSpaceCaptureRequest = {
  minLocalVersion: number;
  minRemoteVersion: number;
  /** When false, remote version gate is skipped (solo / no partner). */
  requireRemote: boolean;
  requestedAtMs: number;
  /** Optional presentation gate (for example, an imperative shutter companion override). */
  minCompositeGeneration?: number;
};

export type SameSpaceWysiwygCaptureResult = {
  compositeBlob: Blob;
  localCutoutBlob: Blob;
  mirrorX: boolean;
  captureVersion: {
    localCommit: number;
    remoteCommit: number;
    localDrawn: number;
    remoteDrawn: number;
    compositeGeneration: number;
  };
};

export function createEmptyCompositorDrawState(): SameSpaceCompositorDrawState {
  return {
    localDrawnVersion: 0,
    remoteDrawnVersion: 0,
    compositeGeneration: 0,
    lastFrameTimeMs: 0,
  };
}

/** True when the visible compositor has painted at least the requested commits. */
export function compositorSatisfiesCaptureRequest(
  draw: SameSpaceCompositorDrawState,
  request: SameSpaceCaptureRequest,
): boolean {
  if (draw.localDrawnVersion < request.minLocalVersion) return false;
  if (request.requireRemote && draw.remoteDrawnVersion < request.minRemoteVersion) return false;
  return draw.compositeGeneration >= Math.max(1, request.minCompositeGeneration ?? 1);
}

export function recordCaptureRequest(
  commits: SameSpaceSourceVersions,
  requireRemote: boolean,
  nowMs = performance.now(),
  minCompositeGeneration?: number,
): SameSpaceCaptureRequest {
  return {
    minLocalVersion: Math.max(0, commits.localCommitVersion),
    minRemoteVersion: Math.max(0, commits.remoteCommitVersion),
    requireRemote,
    requestedAtMs: nowMs,
    ...(minCompositeGeneration == null ? {} : { minCompositeGeneration }),
  };
}

/**
 * Wait until the compositor reports draw versions ≥ the request, then resolve.
 * Rejects on timeout so capture never hangs forever.
 */
export function waitForCompositorCaptureReady(options: {
  getDrawState: () => SameSpaceCompositorDrawState;
  request: SameSpaceCaptureRequest;
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => number;
  cancel?: (id: number) => void;
}): Promise<SameSpaceCompositorDrawState> {
  const timeoutMs = options.timeoutMs ?? 900;
  const pollMs = options.pollMs ?? 16;
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? ((fn, ms) => window.setTimeout(fn, ms) as unknown as number);
  const cancel = options.cancel ?? ((id) => window.clearTimeout(id));

  return new Promise((resolve, reject) => {
    const started = now();
    let handle = 0;
    const tick = () => {
      const draw = options.getDrawState();
      if (compositorSatisfiesCaptureRequest(draw, options.request)) {
        resolve({ ...draw });
        return;
      }
      if (now() - started >= timeoutMs) {
        reject(new Error('SAME_SPACE_CAPTURE_TIMEOUT'));
        return;
      }
      handle = schedule(tick, pollMs);
    };
    tick();
    void cancel; // reserved for callers that wrap and cancel externally
    void handle;
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('CANVAS_TO_BLOB_UNSUPPORTED'));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('CANVAS_TO_BLOB_EMPTY'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

/** Export the live segmented foreground canvas (alpha PNG) — never raw video. */
export async function exportLiveForegroundCutout(
  output: { canvas: HTMLCanvasElement; revision: number } | null,
): Promise<Blob> {
  if (!output || output.revision <= 0 || output.canvas.width <= 0 || output.canvas.height <= 0) {
    throw new Error('SAME_SPACE_LOCAL_FOREGROUND_MISSING');
  }
  return canvasToBlob(output.canvas, 'image/png');
}

/**
 * Snapshot the authoritative visible composite canvas after the draw gate.
 * Cutouts prefer a full-res one-shot segment from the live video element.
 */
export async function snapshotAuthoritativeComposite(options: {
  compositeCanvas: HTMLCanvasElement;
  getDrawState: () => SameSpaceCompositorDrawState;
  getCommitVersions: () => SameSpaceSourceVersions;
  getLocalForeground: () => { canvas: HTMLCanvasElement; revision: number } | null;
  /** Native local camera video — used for high-res cutout at shutter time. */
  getLocalVideo?: () => HTMLVideoElement | null;
  requireRemote: boolean;
  mirrorX: boolean;
  wait?: typeof waitForCompositorCaptureReady;
  toBlob?: typeof canvasToBlob;
  exportCutout?: typeof exportLiveForegroundCutout;
  captureHighResCutout?: typeof captureHighResPersonCutoutFromVideo;
  captureViewportMode?: CaptureViewportMode;
  minCompositeGeneration?: number;
}): Promise<SameSpaceWysiwygCaptureResult> {
  const wait = options.wait ?? waitForCompositorCaptureReady;
  const toBlob = options.toBlob ?? canvasToBlob;
  const exportCutout = options.exportCutout ?? exportLiveForegroundCutout;
  const captureHighRes = options.captureHighResCutout ?? captureHighResPersonCutoutFromVideo;

  const commits = options.getCommitVersions();
  const request = recordCaptureRequest(
    commits,
    options.requireRemote,
    performance.now(),
    options.minCompositeGeneration,
  );
  const draw = await wait({
    getDrawState: options.getDrawState,
    request,
  });

  const [compositeBlob, localCutoutBlob] = await Promise.all([
    (async () => {
      // Copy to an offscreen canvas so async encode never clear/resizes the live stage.
      const snap = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      const target = getCaptureFrameDimensions(options.captureViewportMode ?? 'desktop');
      if (!snap) return toBlob(options.compositeCanvas, 'image/jpeg', 0.92);
      // The visible stage is CSS-sized. The shot asset is always canonical-sized.
      snap.width = target.width;
      snap.height = target.height;
      const ctx = snap.getContext('2d');
      if (!ctx) return toBlob(options.compositeCanvas, 'image/jpeg', 0.92);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(options.compositeCanvas, 0, 0, target.width, target.height);
      return toBlob(snap, 'image/jpeg', 0.92);
    })(),
    (async () => {
      const video = options.getLocalVideo?.() ?? null;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          const hi = await captureHighRes(video);
          return hi.blob;
        } catch {
          // Fall through to live FG snapshot if one-shot segment fails.
        }
      }
      const fg = options.getLocalForeground();
      if (!fg) throw new Error('SAME_SPACE_LOCAL_FOREGROUND_MISSING');
      const snap = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (!snap) return exportCutout(fg);
      snap.width = fg.canvas.width;
      snap.height = fg.canvas.height;
      const ctx = snap.getContext('2d');
      if (!ctx) return exportCutout(fg);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(fg.canvas, 0, 0);
      return exportCutout({ canvas: snap, revision: fg.revision });
    })(),
  ]);

  return {
    compositeBlob,
    localCutoutBlob,
    mirrorX: options.mirrorX,
    captureVersion: {
      localCommit: commits.localCommitVersion,
      remoteCommit: commits.remoteCommitVersion,
      localDrawn: draw.localDrawnVersion,
      remoteDrawn: draw.remoteDrawnVersion,
      compositeGeneration: draw.compositeGeneration,
    },
  };
}

/** Pure helper: next drawn versions after a successful composite frame. */
export function advanceCompositorDrawState(
  previous: SameSpaceCompositorDrawState,
  localRevision: number,
  remoteRevision: number,
  nowMs: number,
): SameSpaceCompositorDrawState {
  return {
    localDrawnVersion: Math.max(0, localRevision),
    remoteDrawnVersion: Math.max(0, remoteRevision),
    compositeGeneration: previous.compositeGeneration + 1,
    lastFrameTimeMs: nowMs,
  };
}

/** Detect stale canvas identity — compositor must never keep a disposed output. */
export function resolveActiveForegroundOutput<T extends { generation: number }>(
  current: T | null,
  expectedGeneration: number,
): T | null {
  if (!current) return null;
  if (current.generation !== expectedGeneration) return null;
  return current;
}
