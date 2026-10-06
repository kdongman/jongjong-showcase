import type { SameSpaceBackground } from './sameSpaceBackground';
import {
  DEFAULT_SAME_SPACE_BACKGROUND,
  isSameSpaceBackground,
  parseSameSpaceBackground,
} from './sameSpaceBackground';
import {
  clampManualOffset,
  DEFAULT_SAME_SPACE_FRONT,
  DEFAULT_SAME_SPACE_MANUAL_OFFSET,
  DEFAULT_SAME_SPACE_SOLO_LAYOUT,
  type SameSpaceFrontPreference,
  type SameSpaceManualOffset,
  type SameSpaceSoloLayout,
} from './sameSpaceLayoutSpec';
import {
  DEFAULT_BOOTH_SCENE_SPAN_MODE,
  LEGACY_BOOTH_SCENE_SPAN_MODE,
  parseBoothSceneSpanMode,
  type BoothSceneSpanMode,
} from './boothSceneSpec';
import {
  clampNormalizedRect,
  cloneShotCompositionPlacements,
  emptyShotCompositionPlacements,
  type NormalizedSubjectRect,
  type ShotCompositionPlacements,
  type ShotModePlacements,
  type SubjectId,
  type SubjectPlacement,
} from './subjectPlacement';

export const SAME_SPACE_CROPS_META_KEY = '__sameSpace';

/** @deprecated Prefer slotSubjectPlacements keyed by participant SubjectId. */
export type SameSpaceSlotManualOffsets = {
  left: SameSpaceManualOffset;
  right: SameSpaceManualOffset;
  /** Optional per-shot z-order override (who is drawn in front). */
  frontSlot?: SameSpaceFrontPreference;
};

export type SameSpaceCompositionMeta = {
  background: SameSpaceBackground;
  frontSlot: SameSpaceFrontPreference;
  soloLayout: SameSpaceSoloLayout;
  revision: number;
  /** Whole-strip scene width mode — one value for all four cells. */
  sceneSpanMode: BoothSceneSpanMode;
  /**
   * @deprecated Legacy left/right base-relative deltas.
   * Migrated once into slotSubjectPlacements; not written for new edits.
   */
  slotManualOffsets?: Record<string, SameSpaceSlotManualOffsets>;
  /**
   * Per shotIndex → mode-specific absolute placements keyed by participant SubjectId.
   */
  slotSubjectPlacements?: Record<string, ShotCompositionPlacements>;
};

export const DEFAULT_SAME_SPACE_COMPOSITION_META: SameSpaceCompositionMeta = {
  background: DEFAULT_SAME_SPACE_BACKGROUND,
  frontSlot: DEFAULT_SAME_SPACE_FRONT,
  soloLayout: DEFAULT_SAME_SPACE_SOLO_LAYOUT,
  revision: 0,
  sceneSpanMode: DEFAULT_BOOTH_SCENE_SPAN_MODE,
  slotManualOffsets: {},
  slotSubjectPlacements: {},
};

function parseNormalizedRect(value: unknown): NormalizedSubjectRect | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (![row.x, row.y, row.width, row.height].every((n) => Number.isFinite(Number(n)))) return null;
  return clampNormalizedRect({
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
  });
}

function parseSubjectPlacement(value: unknown): SubjectPlacement {
  if (!value || typeof value !== 'object') return { mode: 'auto', rect: null };
  const row = value as Record<string, unknown>;
  const mode = row.mode === 'manual' ? 'manual' : 'auto';
  const rect = mode === 'manual' ? parseNormalizedRect(row.rect) : null;
  if (mode === 'manual' && !rect) return { mode: 'auto', rect: null };
  return { mode, rect };
}

function parseModePlacements(value: unknown): ShotModePlacements {
  if (!value || typeof value !== 'object') return {};
  const out: ShotModePlacements = {};
  for (const [subjectId, placement] of Object.entries(value as Record<string, unknown>)) {
    if (!subjectId || typeof subjectId !== 'string') continue;
    out[subjectId] = parseSubjectPlacement(placement);
  }
  return out;
}

function parseShotCompositionPlacements(value: unknown): ShotCompositionPlacements {
  if (!value || typeof value !== 'object') return emptyShotCompositionPlacements();
  const row = value as Record<string, unknown>;
  const frontSubjectId = typeof row.frontSubjectId === 'string' && row.frontSubjectId
    ? row.frontSubjectId
    : null;
  return {
    one_cell: parseModePlacements(row.one_cell),
    two_cell: parseModePlacements(row.two_cell),
    frontSubjectId,
  };
}

function parseSlotSubjectPlacements(value: unknown): Record<string, ShotCompositionPlacements> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, ShotCompositionPlacements> = {};
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) continue;
    out[key] = parseShotCompositionPlacements(row);
  }
  return out;
}

function parseSlotManualOffsets(value: unknown): Record<string, SameSpaceSlotManualOffsets> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, SameSpaceSlotManualOffsets> = {};
  for (const [key, row] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key) || !row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const leftRaw = record.left && typeof record.left === 'object'
      ? record.left as Record<string, unknown>
      : null;
    const rightRaw = record.right && typeof record.right === 'object'
      ? record.right as Record<string, unknown>
      : null;
    const frontSlot = record.frontSlot === 'right' || record.frontSlot === 'left'
      ? record.frontSlot
      : undefined;
    out[key] = {
      left: clampManualOffset(leftRaw
        ? {
          offsetX: Number(leftRaw.offsetX ?? 0),
          offsetY: Number(leftRaw.offsetY ?? 0),
          scale: Number(leftRaw.scale ?? 1),
          mode: leftRaw.mode === 'manual' ? 'manual' : 'auto',
        }
        : DEFAULT_SAME_SPACE_MANUAL_OFFSET),
      right: clampManualOffset(rightRaw
        ? {
          offsetX: Number(rightRaw.offsetX ?? 0),
          offsetY: Number(rightRaw.offsetY ?? 0),
          scale: Number(rightRaw.scale ?? 1),
          mode: rightRaw.mode === 'manual' ? 'manual' : 'auto',
        }
        : DEFAULT_SAME_SPACE_MANUAL_OFFSET),
      ...(frontSlot ? { frontSlot } : {}),
    };
  }
  return out;
}

function packModePlacements(row: ShotModePlacements): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [subjectId, placement] of Object.entries(row ?? {})) {
    if (!subjectId) continue;
    out[subjectId] = {
      mode: placement.mode === 'manual' ? 'manual' : 'auto',
      rect: placement.mode === 'manual' && placement.rect
        ? clampNormalizedRect(placement.rect)
        : null,
    };
  }
  return out;
}

export function parseSameSpaceCompositionMeta(value: unknown): SameSpaceCompositionMeta {
  if (!value || typeof value !== 'object') {
    return {
      ...DEFAULT_SAME_SPACE_COMPOSITION_META,
      // Missing meta blob = legacy wide strip.
      sceneSpanMode: LEGACY_BOOTH_SCENE_SPAN_MODE,
      slotManualOffsets: {},
      slotSubjectPlacements: {},
    };
  }
  const record = value as Record<string, unknown>;
  const frontSlot = record.frontSlot === 'right' ? 'right' : 'left';
  const soloLayout = record.soloLayout === 'center' ? 'center' : 'half';
  const revision = Number.isFinite(Number(record.revision)) ? Number(record.revision) : 0;
  const hasExplicitSpan = Object.prototype.hasOwnProperty.call(record, 'sceneSpanMode');
  return {
    background: isSameSpaceBackground(record.background)
      ? parseSameSpaceBackground(record.background)
      : DEFAULT_SAME_SPACE_BACKGROUND,
    frontSlot,
    soloLayout,
    revision,
    sceneSpanMode: hasExplicitSpan
      ? parseBoothSceneSpanMode(record.sceneSpanMode, LEGACY_BOOTH_SCENE_SPAN_MODE)
      : LEGACY_BOOTH_SCENE_SPAN_MODE,
    slotManualOffsets: parseSlotManualOffsets(record.slotManualOffsets),
    slotSubjectPlacements: parseSlotSubjectPlacements(record.slotSubjectPlacements),
  };
}

/** Split numeric slot crops from the reserved Same Space meta blob. */
export function splitSlotCropsAndMeta(
  crops: Record<string, unknown> | null | undefined,
): {
  slotCrops: Record<string, { scale: number; x: number; y: number }>;
  meta: SameSpaceCompositionMeta;
} {
  const slotCrops: Record<string, { scale: number; x: number; y: number }> = {};
  let meta: SameSpaceCompositionMeta = {
    ...DEFAULT_SAME_SPACE_COMPOSITION_META,
    slotManualOffsets: {},
    slotSubjectPlacements: {},
  };
  if (!crops || typeof crops !== 'object') return { slotCrops, meta };
  for (const [key, value] of Object.entries(crops)) {
    if (key === SAME_SPACE_CROPS_META_KEY) {
      meta = parseSameSpaceCompositionMeta(value);
      continue;
    }
    if (!/^\d+$/.test(key) || !value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    slotCrops[key] = {
      scale: Number(row.scale ?? 1) || 1,
      x: Number(row.x ?? 0) || 0,
      y: Number(row.y ?? 0) || 0,
    };
  }
  return { slotCrops, meta };
}

export function packSlotCropsWithMeta(
  slotCrops: Record<string | number, { scale: number; x: number; y: number }>,
  meta: SameSpaceCompositionMeta,
): Record<string, unknown> {
  const packed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(slotCrops)) {
    if (!/^\d+$/.test(String(key))) continue;
    packed[String(key)] = value;
  }
  const background = parseSameSpaceBackground(meta.background);
  // Legacy left/right is retained only for unread hydration of old sessions —
  // new editor saves clear per-shot legacy rows when absolute placements exist.
  const slotManualOffsets: Record<string, SameSpaceSlotManualOffsets> = {};
  for (const [key, value] of Object.entries(meta.slotManualOffsets ?? {})) {
    if (!/^\d+$/.test(key) || !value) continue;
    // Skip legacy write when absolute placements cover this shot.
    if (meta.slotSubjectPlacements?.[key]) continue;
    slotManualOffsets[key] = {
      left: clampManualOffset(value.left),
      right: clampManualOffset(value.right),
      ...(value.frontSlot === 'left' || value.frontSlot === 'right'
        ? { frontSlot: value.frontSlot }
        : {}),
    };
  }
  const slotSubjectPlacements: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta.slotSubjectPlacements ?? {})) {
    if (!/^\d+$/.test(key) || !value) continue;
    const cloned = cloneShotCompositionPlacements(value);
    slotSubjectPlacements[key] = {
      one_cell: packModePlacements(cloned.one_cell),
      two_cell: packModePlacements(cloned.two_cell),
      frontSubjectId: cloned.frontSubjectId ?? null,
    };
  }
  packed[SAME_SPACE_CROPS_META_KEY] = {
    background,
    frontSlot: meta.frontSlot === 'right' ? 'right' : 'left',
    soloLayout: meta.soloLayout === 'center' ? 'center' : 'half',
    revision: Number.isFinite(meta.revision) ? meta.revision : 0,
    sceneSpanMode: parseBoothSceneSpanMode(meta.sceneSpanMode, DEFAULT_BOOTH_SCENE_SPAN_MODE),
    slotManualOffsets,
    slotSubjectPlacements,
  };
  return packed;
}

export function slotManualOffsetsFor(
  meta: SameSpaceCompositionMeta,
  slot: number | string,
): SameSpaceSlotManualOffsets {
  const key = String(slot);
  return meta.slotManualOffsets?.[key] ?? {
    left: { ...DEFAULT_SAME_SPACE_MANUAL_OFFSET },
    right: { ...DEFAULT_SAME_SPACE_MANUAL_OFFSET },
  };
}

export function slotSubjectPlacementsFor(
  meta: SameSpaceCompositionMeta,
  shotIndex: number | string,
): ShotCompositionPlacements {
  const key = String(shotIndex);
  return cloneShotCompositionPlacements(
    meta.slotSubjectPlacements?.[key] ?? emptyShotCompositionPlacements(),
  );
}

export function slotFrontSubjectIdFor(
  meta: SameSpaceCompositionMeta,
  shotIndex: number | string,
  leftSubjectId: SubjectId,
  rightSubjectId: SubjectId,
): SubjectId | null {
  const placements = slotSubjectPlacementsFor(meta, shotIndex);
  if (placements.frontSubjectId) return placements.frontSubjectId;
  const legacy = slotManualOffsetsFor(meta, shotIndex).frontSlot ?? meta.frontSlot;
  return legacy === 'right' ? rightSubjectId : leftSubjectId;
}

export function slotFrontSlotFor(
  meta: SameSpaceCompositionMeta,
  shotIndex: number | string,
): SameSpaceFrontPreference {
  const placements = meta.slotSubjectPlacements?.[String(shotIndex)];
  if (placements?.frontSubjectId) {
    // Without subject→slot map, fall back to meta frontSlot — callers with
    // participant ids should use slotFrontSubjectIdFor.
    return meta.frontSlot;
  }
  return slotManualOffsetsFor(meta, shotIndex).frontSlot ?? meta.frontSlot;
}
