import type { BoothCompanionSnapshot } from '@shared/coupleBoothStage';

type CachedSprite = { image: HTMLImageElement; bounds: { minX: number; minY: number; maxX: number; maxY: number } };
const cache = new Map<string, Promise<CachedSprite | null>>();
const resolvedCache = new Map<string, CachedSprite | null>();

export function isDrawableBoothCompanion(companion: BoothCompanionSnapshot | null | undefined): companion is BoothCompanionSnapshot {
  if (!companion?.id || !companion.renderAsset?.uri || !companion.transform) return false;
  const { x, y, scale, rotation } = companion.transform;
  return [x, y, scale, rotation].every(Number.isFinite) && scale > 0;
}

function load(uri: string): Promise<CachedSprite | null> {
  const existing = cache.get(uri);
  if (existing) return existing;
  const promise = new Promise<CachedSprite | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onerror = () => resolve(null);
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return resolve(null);
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
        for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3]! > 8) {
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          }
        }
        const sprite = { image, bounds: maxX >= minX ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: canvas.width - 1, maxY: canvas.height - 1 } };
        resolvedCache.set(uri, sprite); resolve(sprite);
      } catch { resolvedCache.set(uri, null); resolve(null); }
    };
    image.src = uri;
  });
  cache.set(uri, promise);
  return promise;
}

export async function preloadBoothCompanions(companions: BoothCompanionSnapshot[]): Promise<void> {
  await Promise.all(companions.filter(isDrawableBoothCompanion).map((companion) => load(companion.renderAsset.uri)));
}

export function drawBoothCompanions(ctx: CanvasRenderingContext2D, width: number, height: number, companions: BoothCompanionSnapshot[]): void {
  for (const companion of companions.filter(isDrawableBoothCompanion).sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))) {
    void load(companion.renderAsset.uri);
    const sprite = resolvedCache.get(companion.renderAsset.uri);
    if (!sprite) continue;
    const sourceW = sprite.image.naturalWidth || sprite.image.width;
    const sourceH = sprite.image.naturalHeight || sprite.image.height;
    const visibleW = Math.max(1, sprite.bounds.maxX - sprite.bounds.minX + 1);
    const targetVisibleW = Math.min(width, height) * companion.transform.scale;
    const factor = targetVisibleW / visibleW;
    const fullW = sourceW * factor;
    const fullH = sourceH * factor;
    const visibleCenterX = (sprite.bounds.minX + sprite.bounds.maxX + 1) / 2 * factor;
    const visibleBottom = (sprite.bounds.maxY + 1) * factor;
    ctx.save();
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(companion.transform.x * width, companion.transform.y * height);
    ctx.rotate((companion.transform.rotation * Math.PI) / 180);
    ctx.scale(companion.transform.flipX ? -1 : 1, 1);
    ctx.drawImage(sprite.image, -visibleCenterX, -visibleBottom, fullW, fullH);
    ctx.restore();
  }
}
