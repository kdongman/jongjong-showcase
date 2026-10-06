/** Background descriptors shared by live preview / Review / export. */

import {
  DEFAULT_SAME_SPACE_BACKGROUND_KEY,
  isSameSpaceBackgroundKey,
  type SameSpaceBackgroundKey,
} from './sameSpaceBackgroundPresets';

export type SameSpaceBackground =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angleDeg?: number }
  | {
      type: 'image';
      presetId: string;
      url?: string;
      /** Runtime-only signed front plate URL for Our Room. Never persisted. */
      frontUrl?: string;
      storagePath?: string;
      objectFit?: 'cover' | 'contain';
      positionX?: number;
      positionY?: number;
      blurPx?: number;
      darken?: number;
    }
  | { type: 'preset'; key: SameSpaceBackgroundKey }
  | { type: 'original' };

export const DEFAULT_SAME_SPACE_BACKGROUND: SameSpaceBackground = {
  type: 'preset',
  key: DEFAULT_SAME_SPACE_BACKGROUND_KEY,
};

export const SAME_SPACE_COLOR_PRESETS = [
  { id: 'white', label: '화이트', color: '#FFFFFF' },
  { id: 'cream', label: '크림', color: '#F6EFE4' },
  { id: 'soft-pink', label: '소프트 핑크', color: '#F7E4EC' },
  { id: 'lavender', label: '라벤더', color: '#E8DEF7' },
  { id: 'sky-blue', label: '스카이 블루', color: '#D9EAF7' },
  { id: 'mint', label: '민트', color: '#D9F0E6' },
  { id: 'charcoal', label: '차콜', color: '#2F2A33' },
  { id: 'black', label: '블랙', color: '#121014' },
] as const;

export const SAME_SPACE_IMAGE_PRESETS = [
  {
    id: 'lavender-wash',
    label: '라벤더 워시',
    background: {
      type: 'gradient' as const,
      from: '#EDE4F7',
      to: '#F7F0FF',
      angleDeg: 135,
    },
  },
  {
    id: 'cream-grain',
    label: '크림 필름',
    background: {
      type: 'gradient' as const,
      from: '#F6EFE4',
      to: '#EFE4D4',
      angleDeg: 160,
    },
  },
  {
    id: 'blush-glow',
    label: '블러시 글로우',
    background: {
      type: 'gradient' as const,
      from: '#F8E6EE',
      to: '#EFD9F2',
      angleDeg: 120,
    },
  },
  {
    id: 'sky-soft',
    label: '소프트 스카이',
    background: {
      type: 'gradient' as const,
      from: '#DCECF8',
      to: '#F4F8FC',
      angleDeg: 180,
    },
  },
  {
    id: 'studio',
    label: '스튜디오',
    background: {
      type: 'gradient' as const,
      from: '#E8E4EF',
      to: '#F5F2F8',
      angleDeg: 90,
    },
  },
  {
    id: 'night',
    label: '나이트',
    background: {
      type: 'gradient' as const,
      from: '#1C1824',
      to: '#352B45',
      angleDeg: 200,
    },
  },
] as const;

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Normalize user/CSS color input into a safe #RRGGBB hex. Rejects arbitrary CSS. */
export function normalizeHexColor(input: string | null | undefined, fallback = '#F7F2FA'): string {
  if (!input || typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (!HEX_RE.test(trimmed)) return fallback;
  if (trimmed.length === 4) {
    const r = trimmed[1]!;
    const g = trimmed[2]!;
    const b = trimmed[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

export function isSameSpaceBackground(value: unknown): value is SameSpaceBackground {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.type === 'solid') {
    return typeof record.color === 'string' && HEX_RE.test(record.color.trim());
  }
  if (record.type === 'gradient') {
    return typeof record.from === 'string'
      && typeof record.to === 'string'
      && HEX_RE.test(String(record.from).trim())
      && HEX_RE.test(String(record.to).trim());
  }
  if (record.type === 'image') {
    return typeof record.presetId === 'string' && Boolean(record.presetId);
  }
  if (record.type === 'preset') {
    return isSameSpaceBackgroundKey(record.key);
  }
  if (record.type === 'original') return true;
  return false;
}

export function parseSameSpaceBackground(value: unknown): SameSpaceBackground {
  if (!isSameSpaceBackground(value)) return DEFAULT_SAME_SPACE_BACKGROUND;
  if (value.type === 'solid') {
    return { type: 'solid', color: normalizeHexColor(value.color) };
  }
  if (value.type === 'gradient') {
    return {
      type: 'gradient',
      from: normalizeHexColor(value.from),
      to: normalizeHexColor(value.to),
      angleDeg: typeof value.angleDeg === 'number' ? value.angleDeg : 135,
    };
  }
  if (value.type === 'preset') {
    return {
      type: 'preset',
      key: isSameSpaceBackgroundKey(value.key) ? value.key : DEFAULT_SAME_SPACE_BACKGROUND_KEY,
    };
  }
  if (value.type === 'image') {
    const storagePath = sanitizeBackgroundStoragePath(
      typeof value.storagePath === 'string' ? value.storagePath : undefined,
    );
    return {
      type: 'image',
      presetId: sanitizeBackgroundPresetId(String(value.presetId)),
      // Never trust persisted or client-provided runtime URLs — resign from storagePath.
      url: undefined,
      storagePath,
      objectFit: value.objectFit === 'contain' ? 'contain' : 'cover',
      positionX: typeof value.positionX === 'number' ? clamp01(value.positionX) : 0.5,
      positionY: typeof value.positionY === 'number' ? clamp01(value.positionY) : 0.5,
      blurPx: typeof value.blurPx === 'number' ? Math.min(24, Math.max(0, value.blurPx)) : 0,
      darken: typeof value.darken === 'number' ? Math.min(0.7, Math.max(0, value.darken)) : 0,
    };
  }
  return { type: 'original' };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function sanitizeBackgroundPresetId(input: string): string {
  const trimmed = input.trim().slice(0, 120);
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return 'custom';
  return trimmed;
}

/** Accept only couple/session background object paths — never URLs or traversal. */
export function sanitizeBackgroundStoragePath(
  input: string | null | undefined,
): string | undefined {
  if (!input || typeof input !== 'string') return undefined;
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes('://') || trimmed.includes('..') || trimmed.includes('//')) {
    return undefined;
  }
  if (/^(javascript|data|blob|file):/i.test(trimmed)) return undefined;
  if (!/^[0-9a-fA-F-]{36}\/[0-9a-fA-F-]{36}\/backgrounds\/[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function backgroundKeyFromSameSpaceBackground(
  background: SameSpaceBackground | null | undefined,
): SameSpaceBackgroundKey {
  if (!background) return DEFAULT_SAME_SPACE_BACKGROUND_KEY;
  if (background.type === 'preset') return background.key;
  return DEFAULT_SAME_SPACE_BACKGROUND_KEY;
}

export function sameSpaceBackgroundFromKey(key: SameSpaceBackgroundKey): SameSpaceBackground {
  return { type: 'preset', key };
}

export function isOurRoomBackground(
  background: SameSpaceBackground | null | undefined,
): background is Extract<SameSpaceBackground, { type: 'image' }> {
  return background?.type === 'image' && background.presetId.startsWith('our-room-v1-pets-');
}

export function ourRoomIncludesPets(background: SameSpaceBackground | null | undefined): boolean {
  return isOurRoomBackground(background) && background.presetId.endsWith('-on');
}

export function ourRoomFrontPlatePath(background: SameSpaceBackground | null | undefined): string | null {
  if (!isOurRoomBackground(background) || !background.storagePath) return null;
  return background.storagePath.endsWith('-back.png')
    ? `${background.storagePath.slice(0, -'-back.png'.length)}-front.png`
    : null;
}

/** True when a background storagePath belongs to the given couple/session. */
export function backgroundPathBelongsToSession(
  storagePath: string | null | undefined,
  coupleId: string,
  sessionId: string,
): boolean {
  const path = sanitizeBackgroundStoragePath(storagePath);
  if (!path || !coupleId || !sessionId) return false;
  return path.startsWith(`${coupleId}/${sessionId}/backgrounds/`);
}
