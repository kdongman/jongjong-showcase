import type { SameSpacePersonBounds } from '@shared/sameSpaceComposition';
import { isValidPersonBounds } from '@shared/sameSpaceComposition';

export type ProcessedMask = {
  width: number;
  height: number;
  /** Alpha 0–255 */
  alpha: Uint8ClampedArray;
  bounds: SameSpacePersonBounds | null;
  valid: boolean;
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Convert confidence (0–1) or category mask into feathered alpha + dominant bounds. */
export function processSegmentationMask(input: {
  values: Float32Array | Uint8Array;
  width: number;
  height: number;
  isConfidence: boolean;
}): ProcessedMask {
  const { width, height } = input;
  const alpha = new Uint8ClampedArray(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let personPixels = 0;

  for (let i = 0; i < alpha.length; i += 1) {
    const raw = input.values[i] ?? 0;
    const confidence = input.isConfidence ? Number(raw) : raw > 0 ? 1 : 0;
  // Soften thresholds so body interiors stay opaque while background stays out.
  // Lower edge0 keeps thin hair strands from vanishing into a hard chop line.
  const soft = smoothstep(0.18, 0.55, confidence);
    const value = Math.round(soft * 255);
    alpha[i] = value;
    if (value > 80) {
      personPixels += 1;
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  removeIsolatedNoise(alpha, width, height);
  fillSmallHoles(alpha, width, height);

  // Recompute bounds after cleanup.
  minX = width;
  minY = height;
  maxX = -1;
  maxY = -1;
  personPixels = 0;
  for (let i = 0; i < alpha.length; i += 1) {
    if (alpha[i] <= 80) continue;
    personPixels += 1;
    const x = i % width;
    const y = (i / width) | 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const areaRatio = personPixels / (width * height);
  if (personPixels < 40 || areaRatio < 0.01 || maxX < minX || maxY < minY) {
    return { width, height, alpha, bounds: null, valid: false };
  }

  const padX = Math.max(2, ((maxX - minX + 1) * 0.04) | 0);
  const padY = Math.max(2, ((maxY - minY + 1) * 0.04) | 0);
  const bounds: SameSpacePersonBounds = {
    minX: Math.max(0, minX - padX) / width,
    minY: Math.max(0, minY - padY) / height,
    maxX: Math.min(width - 1, maxX + padX) / width,
    maxY: Math.min(height - 1, maxY + padY) / height,
  };

  return {
    width,
    height,
    alpha,
    bounds: isValidPersonBounds(bounds) ? bounds : null,
    valid: isValidPersonBounds(bounds),
  };
}

function removeIsolatedNoise(alpha: Uint8ClampedArray, width: number, height: number): void {
  // Only remove truly isolated speckles — aggressive neighbor thresholds
  // previously chopped hair tops into a hard horizontal band.
  const copy = alpha.slice();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (copy[i] < 160) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (copy[ny * width + nx] > 96) neighbors += 1;
        }
      }
      if (neighbors === 0) alpha[i] = 0;
    }
  }
}

function fillSmallHoles(alpha: Uint8ClampedArray, width: number, height: number): void {
  const copy = alpha.slice();
  // Two passes fill body holes that selfie-segmenter often leaves in torsos.
  for (let pass = 0; pass < 2; pass += 1) {
    const source = pass === 0 ? copy : alpha.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        if (source[i]! > 40) continue;
        let neighbors = 0;
        let sum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const value = source[(y + dy) * width + (x + dx)]!;
            if (value > 110) {
              neighbors += 1;
              sum += value;
            }
          }
        }
        if (neighbors >= 5) alpha[i] = Math.max(alpha[i]!, Math.round(sum / neighbors));
      }
    }
  }
}
