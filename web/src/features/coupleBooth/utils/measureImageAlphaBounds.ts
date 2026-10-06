import type { SameSpacePersonBounds } from '@shared/sameSpaceComposition';
import { defaultPersonBounds } from '@shared/sameSpaceComposition';

const ALPHA_THRESHOLD = 12;

/**
 * Measure non-transparent visual bounds from an image (0–1 normalized).
 * Used so Review/export scale people by real cutout content, not full-frame defaults.
 */
export async function measureImageAlphaBounds(
  source: CanvasImageSource & { width?: number; naturalWidth?: number; naturalHeight?: number; height?: number },
): Promise<SameSpacePersonBounds> {
  const width = Math.max(1, Math.round(source.naturalWidth || source.width || 0));
  const height = Math.max(1, Math.round(source.naturalHeight || source.height || 0));
  if (width < 2 || height < 2) return defaultPersonBounds();

  const canvas = document.createElement('canvas');
  // Downsample for speed — bounds stay accurate enough for packing.
  const maxEdge = 240;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return defaultPersonBounds();
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return defaultPersonBounds();
  }

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 80));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const alpha = data.data[(y * w + x) * 4 + 3] ?? 0;
      if (alpha < ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return defaultPersonBounds();

  // Pad slightly so hair/shoulders aren't clipped after packing scale.
  const padX = (maxX - minX) * 0.04;
  const padY = (maxY - minY) * 0.04;
  return {
    minX: Math.max(0, (minX - padX) / w),
    minY: Math.max(0, (minY - padY) / h),
    maxX: Math.min(1, (maxX + padX) / w),
    maxY: Math.min(1, (maxY + padY) / h),
  };
}
