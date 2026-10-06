/**
 * Same Space background presets — procedural original art only.
 * No third-party photo booth branding or scraped imagery.
 */

export type SameSpaceBackgroundKey =
  | 'studio_cream'
  | 'studio_blush'
  | 'studio_lavender'
  | 'studio_sky'
  | 'studio_charcoal'
  | 'booth_soft_gray'
  | 'booth_pink'
  | 'booth_black'
  | 'mood_golden_window'
  | 'mood_blue_hour'
  | 'mood_film_beige'
  | 'mood_rainy_night';

export type SameSpaceBackgroundCategory = 'studio' | 'photo_booth' | 'mood';

export type SameSpaceBackgroundPreset = {
  key: SameSpaceBackgroundKey;
  category: SameSpaceBackgroundCategory;
  label: string;
  /** Short label under the thumbnail. */
  shortLabel: string;
  rendererType: 'procedural';
  fallbackGradient: { from: string; to: string; angleDeg: number };
  textTone: 'dark' | 'light';
  /** Soft center wash strength 0–1. */
  wash: number;
};

export const SAME_SPACE_BACKGROUND_PRESETS: readonly SameSpaceBackgroundPreset[] = [
  {
    key: 'studio_cream',
    category: 'studio',
    label: '소프트 크림',
    shortLabel: '크림',
    rendererType: 'procedural',
    fallbackGradient: { from: '#F7EFE3', to: '#EFE4D6', angleDeg: 160 },
    textTone: 'dark',
    wash: 0.16,
  },
  {
    key: 'studio_blush',
    category: 'studio',
    label: '블러시 핑크',
    shortLabel: '블러시',
    rendererType: 'procedural',
    fallbackGradient: { from: '#F4E2E8', to: '#EBD5DE', angleDeg: 145 },
    textTone: 'dark',
    wash: 0.12,
  },
  {
    key: 'studio_lavender',
    category: 'studio',
    label: '라벤더 헤이즈',
    shortLabel: '라벤더',
    rendererType: 'procedural',
    fallbackGradient: { from: '#E8DEF5', to: '#F3ECFB', angleDeg: 135 },
    textTone: 'dark',
    wash: 0.14,
  },
  {
    key: 'studio_sky',
    category: 'studio',
    label: '스카이 블루',
    shortLabel: '스카이',
    rendererType: 'procedural',
    fallbackGradient: { from: '#D7E8F5', to: '#F0F6FB', angleDeg: 180 },
    textTone: 'dark',
    wash: 0.15,
  },
  {
    key: 'studio_charcoal',
    category: 'studio',
    label: '차콜 스튜디오',
    shortLabel: '차콜',
    rendererType: 'procedural',
    fallbackGradient: { from: '#2A2630', to: '#1A171E', angleDeg: 200 },
    textTone: 'light',
    wash: 0.08,
  },
  {
    key: 'booth_soft_gray',
    category: 'photo_booth',
    label: '소프트 그레이',
    shortLabel: '그레이',
    rendererType: 'procedural',
    fallbackGradient: { from: '#E6E3E0', to: '#D4D0CC', angleDeg: 90 },
    textTone: 'dark',
    wash: 0.06,
  },
  {
    key: 'booth_pink',
    category: 'photo_booth',
    label: '핑크 부스',
    shortLabel: '핑크',
    rendererType: 'procedural',
    fallbackGradient: { from: '#F0C9D4', to: '#E5B0BF', angleDeg: 120 },
    textTone: 'dark',
    wash: 0.08,
  },
  {
    key: 'booth_black',
    category: 'photo_booth',
    label: '블랙 부스',
    shortLabel: '블랙',
    rendererType: 'procedural',
    fallbackGradient: { from: '#14131A', to: '#0B0A10', angleDeg: 210 },
    textTone: 'light',
    wash: 0.05,
  },
  {
    key: 'mood_golden_window',
    category: 'mood',
    label: '골든 윈도우',
    shortLabel: '골든',
    rendererType: 'procedural',
    fallbackGradient: { from: '#F2D7B0', to: '#C9A07A', angleDeg: 115 },
    textTone: 'dark',
    wash: 0.1,
  },
  {
    key: 'mood_blue_hour',
    category: 'mood',
    label: '블루 아워',
    shortLabel: '블루아워',
    rendererType: 'procedural',
    fallbackGradient: { from: '#3A3F6B', to: '#1C1A33', angleDeg: 200 },
    textTone: 'light',
    wash: 0.1,
  },
  {
    key: 'mood_film_beige',
    category: 'mood',
    label: '필름 베이지',
    shortLabel: '필름',
    rendererType: 'procedural',
    fallbackGradient: { from: '#E8DCC8', to: '#D4C4AA', angleDeg: 150 },
    textTone: 'dark',
    wash: 0.09,
  },
  {
    key: 'mood_rainy_night',
    category: 'mood',
    label: '레이니 나이트',
    shortLabel: '레이니',
    rendererType: 'procedural',
    fallbackGradient: { from: '#23243A', to: '#12121F', angleDeg: 220 },
    textTone: 'light',
    wash: 0.08,
  },
] as const;

export const DEFAULT_SAME_SPACE_BACKGROUND_KEY: SameSpaceBackgroundKey = 'studio_cream';

const PRESET_BY_KEY = Object.fromEntries(
  SAME_SPACE_BACKGROUND_PRESETS.map((preset) => [preset.key, preset]),
) as Record<SameSpaceBackgroundKey, SameSpaceBackgroundPreset>;

export const SAME_SPACE_BACKGROUND_KEYS = SAME_SPACE_BACKGROUND_PRESETS.map((p) => p.key);

export function isSameSpaceBackgroundKey(value: unknown): value is SameSpaceBackgroundKey {
  return typeof value === 'string' && value in PRESET_BY_KEY;
}

export function resolveSameSpaceBackgroundPreset(
  key: string | null | undefined,
): SameSpaceBackgroundPreset {
  if (isSameSpaceBackgroundKey(key)) return PRESET_BY_KEY[key];
  return PRESET_BY_KEY[DEFAULT_SAME_SPACE_BACKGROUND_KEY];
}

export function presetsForCategory(
  category: SameSpaceBackgroundCategory,
): readonly SameSpaceBackgroundPreset[] {
  return SAME_SPACE_BACKGROUND_PRESETS.filter((preset) => preset.category === category);
}

export const SAME_SPACE_BACKGROUND_CATEGORY_LABELS: Record<SameSpaceBackgroundCategory, string> = {
  studio: '스튜디오',
  photo_booth: '포토부스',
  mood: '감성',
};

/** Deterministic pseudo-noise in [0,1) — no Math.random in the render path. */
function hashNoise(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function fillLinearGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  from: string,
  to: string,
  angleDeg: number,
): void {
  const angle = (angleDeg * Math.PI) / 180;
  const x0 = width / 2 - (Math.cos(angle) * width) / 2;
  const y0 = height / 2 - (Math.sin(angle) * height) / 2;
  const x1 = width / 2 + (Math.cos(angle) * width) / 2;
  const y1 = height / 2 + (Math.sin(angle) * height) / 2;
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function paintCenterWash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strength: number,
  light = true,
): void {
  if (strength <= 0) return;
  const wash = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    Math.min(width, height) * 0.06,
    width * 0.5,
    height * 0.52,
    Math.max(width, height) * 0.7,
  );
  if (light) {
    wash.addColorStop(0, `rgba(255,255,255,${0.1 + strength * 0.55})`);
    wash.addColorStop(0.55, `rgba(255,255,255,${strength * 0.18})`);
    wash.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    wash.addColorStop(0, `rgba(255,255,255,${strength * 0.22})`);
    wash.addColorStop(0.5, `rgba(255,255,255,${strength * 0.06})`);
    wash.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
}

function paintSoftFloor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rgba: string,
): void {
  const floor = ctx.createLinearGradient(0, height * 0.7, 0, height);
  floor.addColorStop(0, 'rgba(0,0,0,0)');
  floor.addColorStop(1, rgba);
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, width, height);
}

function paintGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number,
  seed: number,
): void {
  if (amount <= 0) return;
  const step = Math.max(3, Math.round(Math.min(width, height) / 90));
  ctx.save();
  ctx.globalAlpha = amount;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const n = hashNoise(x, y, seed);
      if (n < 0.55) continue;
      const shade = Math.floor(n * 255);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.restore();
}

function paintBokeh(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  count: number,
  color: string,
  seed: number,
): void {
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const px = hashNoise(i * 3.1, 1.7, seed) * width;
    const py = hashNoise(i * 5.3, 2.9, seed) * height * 0.75;
    const r = 4 + hashNoise(i, 9.1, seed) * Math.min(width, height) * 0.035;
    ctx.globalAlpha = 0.08 + hashNoise(i, 4.2, seed) * 0.12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintWindowLight(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const beam = ctx.createRadialGradient(
    width * 0.18,
    height * 0.2,
    Math.min(width, height) * 0.04,
    width * 0.35,
    height * 0.45,
    Math.max(width, height) * 0.55,
  );
  beam.addColorStop(0, 'rgba(255,236,190,0.55)');
  beam.addColorStop(0.45, 'rgba(255,210,150,0.18)');
  beam.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Draw a preset into the Same Space compositor.
 * Must stay identical for live preview and WYSIWYG capture.
 */
export function renderSameSpaceBackgroundPreset(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  key: SameSpaceBackgroundKey | string | null | undefined,
): void {
  const preset = resolveSameSpaceBackgroundPreset(key);
  const { from, to, angleDeg } = preset.fallbackGradient;
  fillLinearGradient(ctx, width, height, from, to, angleDeg);

  const dark = preset.textTone === 'light';
  paintCenterWash(ctx, width, height, preset.wash, !dark);
  paintSoftFloor(
    ctx,
    width,
    height,
    dark ? 'rgba(0,0,0,0.28)' : 'rgba(40,28,55,0.08)',
  );

  switch (preset.key) {
    case 'booth_soft_gray':
      paintGrain(ctx, width, height, 0.045, 11);
      break;
    case 'booth_pink':
      paintGrain(ctx, width, height, 0.05, 17);
      break;
    case 'booth_black':
      paintCenterWash(ctx, width, height, 0.04, false);
      break;
    case 'mood_golden_window':
      paintWindowLight(ctx, width, height);
      paintGrain(ctx, width, height, 0.03, 23);
      break;
    case 'mood_blue_hour':
      paintBokeh(ctx, width, height, 18, '#B8C4FF', 29);
      break;
    case 'mood_film_beige':
      paintGrain(ctx, width, height, 0.055, 31);
      paintCenterWash(ctx, width, height, 0.06, true);
      break;
    case 'mood_rainy_night':
      paintBokeh(ctx, width, height, 22, '#9AA6D8', 37);
      paintGrain(ctx, width, height, 0.03, 41);
      break;
    default:
      break;
  }
}

/** Tiny data-URL thumbnail for the picker (no external assets). */
export function backgroundPresetThumbnailDataUrl(key: SameSpaceBackgroundKey): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  renderSameSpaceBackgroundPreset(ctx, 96, 72, key);
  return canvas.toDataURL('image/jpeg', 0.82);
}
