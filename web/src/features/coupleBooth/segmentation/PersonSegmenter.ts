import { processSegmentationMask } from './maskProcessing';

// Prepared at build time into Vite's public directory. This keeps the deployed
// model and WASM on the Booth origin instead of making capture depend on a CDN.
const viteEnv = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
const BASE_URL = String(viteEnv?.BASE_URL ?? '/').replace(/\/?$/, '/');
const ASSET_ROOT = `${BASE_URL}mediapipe`;
const WASM = `${ASSET_ROOT}/wasm`;
const MODEL = `${ASSET_ROOT}/selfie_segmenter_landscape.tflite`;

let segmenter: any;
let segmenterMode: 'IMAGE' | null = null;

async function getImageSegmenter(): Promise<any> {
  const vision: any = await import('@mediapipe/tasks-vision');
  if (!segmenter || segmenterMode !== 'IMAGE') {
    try {
      segmenter?.close?.();
    } catch {
      /* ignore */
    }
    const files = await vision.FilesetResolver.forVisionTasks(WASM);
    segmenter = await vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
    segmenterMode = 'IMAGE';
  }
  return segmenter;
}

/**
 * Build an immutable transparent PNG cutout from a still source blob.
 * Uses confidence masks + the same feather/hole-fill path as live preview so
 * Review/export quality matches the composition rules.
 */
export async function createPersonCutout(source: Blob): Promise<Blob> {
  // Decode into an immutable bitmap owned by this shot — never reuse a live canvas.
  const bitmap = await createImageBitmap(source);
  try {
    const active = await getImageSegmenter();
    const result = active.segment(bitmap);
    try {
      const confidence = result.confidenceMasks?.[0];
      if (!confidence) throw new Error('CUTOUT_MASK_MISSING');

      let values: Float32Array | Uint8Array;
      let isConfidence = true;
      try {
        values = confidence.getAsFloat32Array();
      } catch {
        values = confidence.getAsUint8Array();
        isConfidence = false;
      }

      const width = bitmap.width;
      const height = bitmap.height;
      if (values.length !== width * height) {
        // Some builds return mask at model resolution — resize without smoothing alpha.
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
        if (!maskCtx) throw new Error('CANVAS_UNSUPPORTED');
        const inferW = confidence.width ?? Math.round(Math.sqrt(values.length * (width / height)));
        const inferH = confidence.height ?? Math.round(values.length / Math.max(1, inferW));
        const raw = document.createElement('canvas');
        raw.width = Math.max(1, inferW);
        raw.height = Math.max(1, inferH);
        const rawCtx = raw.getContext('2d', { willReadFrequently: true });
        if (!rawCtx) throw new Error('CANVAS_UNSUPPORTED');
        const rawImage = rawCtx.createImageData(raw.width, raw.height);
        for (let i = 0; i < values.length; i += 1) {
          const conf = isConfidence ? Number(values[i] ?? 0) : (values[i] ?? 0) > 0 ? 1 : 0;
          rawImage.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, conf)) * 255);
        }
        rawCtx.putImageData(rawImage, 0, 0);
        maskCtx.imageSmoothingEnabled = false;
        maskCtx.clearRect(0, 0, width, height);
        maskCtx.drawImage(raw, 0, 0, width, height);
        const resized = maskCtx.getImageData(0, 0, width, height);
        const resizedValues = new Float32Array(width * height);
        for (let i = 0; i < resizedValues.length; i += 1) {
          resizedValues[i] = (resized.data[i * 4 + 3] ?? 0) / 255;
        }
        values = resizedValues;
        isConfidence = true;
      }

      const processed = processSegmentationMask({
        values,
        width,
        height,
        isConfidence,
      });
      if (!processed.valid) throw new Error('CUTOUT_MASK_INVALID');

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('CANVAS_UNSUPPORTED');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, width, height);
      for (let i = 0; i < processed.alpha.length; i += 1) {
        pixels.data[i * 4 + 3] = processed.alpha[i]!;
      }
      ctx.putImageData(pixels, 0, 0);
      confidence.close?.();

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('CUTOUT_ENCODE_FAILED'))),
          'image/png',
        );
      });
    } finally {
      result?.close?.();
    }
  } finally {
    bitmap.close();
  }
}
