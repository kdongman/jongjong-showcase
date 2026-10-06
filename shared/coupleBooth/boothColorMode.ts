/** Shared color / monochrome filter for Review preview and final export. */

export type BoothColorMode = 'color' | 'monochrome';

export const DEFAULT_BOOTH_COLOR_MODE: BoothColorMode = 'color';

/** CSS / Canvas2D filter string — keep preview and export identical. */
export const BOOTH_COLOR_MODE_FILTER: Record<BoothColorMode, string> = {
  color: 'none',
  monochrome: 'grayscale(1) contrast(1.06) brightness(1.01)',
};

export function isBoothColorMode(value: unknown): value is BoothColorMode {
  return value === 'color' || value === 'monochrome';
}

export function parseBoothColorMode(value: unknown): BoothColorMode {
  return isBoothColorMode(value) ? value : DEFAULT_BOOTH_COLOR_MODE;
}

/** Apply color mode to an already-composited canvas (full strip / stage). */
export function applyBoothColorModeToCanvas(
  source: HTMLCanvasElement | OffscreenCanvas,
  colorMode: BoothColorMode,
): HTMLCanvasElement {
  const width = 'width' in source ? Number(source.width) : 0;
  const height = 'height' in source ? Number(source.height) : 0;
  const out = document.createElement('canvas');
  out.width = Math.max(1, width);
  out.height = Math.max(1, height);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.filter = BOOTH_COLOR_MODE_FILTER[colorMode];
  ctx.drawImage(source as CanvasImageSource, 0, 0);
  ctx.filter = 'none';
  return out;
}

/** In-place filter when drawing onto an existing context. */
export function withBoothColorModeFilter(
  ctx: CanvasRenderingContext2D,
  colorMode: BoothColorMode,
  draw: () => void,
): void {
  ctx.save();
  ctx.filter = BOOTH_COLOR_MODE_FILTER[colorMode];
  draw();
  ctx.restore();
  ctx.filter = 'none';
}
