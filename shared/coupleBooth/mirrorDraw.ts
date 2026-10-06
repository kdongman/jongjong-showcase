/**
 * Couple Booth mirror policy: apply canvas flip at most once.
 *
 * A) Cutout pixels are unmirrored → renderer applies mirrorX
 * B) Cutout/JPEG pixels already mirrored → renderer must not flip again
 */

export type BoothMirrorMeta = {
  mirrorX?: boolean | null;
  /** True when the stored bitmap is already horizontally flipped. */
  mirrorBakedIntoAsset?: boolean | null;
  /** Alias preferred in newer manifests; falls back to mirrorBakedIntoAsset. */
  pixelsMirrored?: boolean | null;
};

export function pixelsAreMirrored(meta: BoothMirrorMeta | null | undefined): boolean {
  if (!meta) return false;
  if (meta.pixelsMirrored != null) return Boolean(meta.pixelsMirrored);
  if (meta.mirrorBakedIntoAsset != null) return Boolean(meta.mirrorBakedIntoAsset);
  return false;
}

/** Apply canvas mirror iff the shot wants mirror and pixels are still unmirrored. */
export function shouldApplyCanvasMirror(meta: BoothMirrorMeta | null | undefined): boolean {
  if (!meta) return false;
  return Boolean(meta.mirrorX) && !pixelsAreMirrored(meta);
}

/**
 * Same Space FG cutouts are exported from the unmirrored segmenter canvas.
 * Legacy rows may incorrectly claim mirrorBakedIntoAsset=true — force unmirrored pixels.
 */
export function sameSpaceCutoutMirrorMeta(
  mirrorX: boolean | null | undefined,
): Required<Pick<BoothMirrorMeta, 'mirrorX' | 'mirrorBakedIntoAsset' | 'pixelsMirrored'>> {
  return {
    mirrorX: mirrorX !== false,
    mirrorBakedIntoAsset: false,
    pixelsMirrored: false,
  };
}

/**
 * Draw an image into a destination rect, optionally mirroring about the dest center X.
 * Isolated save/restore so sibling layers are unaffected.
 */
export function drawImageMaybeMirrored(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  mirror: BoothMirrorMeta | null | undefined,
): void {
  if (!shouldApplyCanvasMirror(mirror)) {
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }
  const centerX = dx + dw / 2;
  ctx.save();
  ctx.translate(centerX, 0);
  ctx.scale(-1, 1);
  ctx.translate(-centerX, 0);
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();
}
