import {
  analyzeBoothForegroundPixels,
  type BoothForegroundLightingStatistics,
} from '@shared/participantLighting';

const SAMPLE_EDGE = 48;
let sampleCanvas: HTMLCanvasElement | null = null;

function sourceDimensions(source: CanvasImageSource): { width: number; height: number } {
  if ('videoWidth' in source) {
    return { width: Number(source.videoWidth) || 0, height: Number(source.videoHeight) || 0 };
  }
  if ('naturalWidth' in source) {
    return { width: Number(source.naturalWidth) || 0, height: Number(source.naturalHeight) || 0 };
  }
  if ('width' in source && 'height' in source) {
    return { width: Number(source.width) || 0, height: Number(source.height) || 0 };
  }
  return { width: 0, height: 0 };
}

/** Downsampled, reusable foreground sampling. Failure is always identity-safe. */
export function measureForegroundLightingSource(
  source: CanvasImageSource | null | undefined,
): BoothForegroundLightingStatistics | null {
  if (!source || typeof document === 'undefined') return null;
  const dimensions = sourceDimensions(source);
  if (dimensions.width < 2 || dimensions.height < 2) return null;
  sampleCanvas ??= document.createElement('canvas');
  sampleCanvas.width = SAMPLE_EDGE;
  sampleCanvas.height = SAMPLE_EDGE;
  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.clearRect(0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
    ctx.drawImage(source, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
    const pixels = ctx.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
    return analyzeBoothForegroundPixels(pixels.data);
  } catch {
    return null;
  }
}
