export type CompositionEditorSource = 'shot-card' | 'final-strip';

export type CompositionEditorTarget = {
  shotIndex: number;
  stripSlotIndex?: number;
  source: CompositionEditorSource;
};

/**
 * Map a final-strip slot to the selected shot index.
 * Never treat stripSlotIndex as shotIndex.
 */
export function resolveStripShotIndex(
  selectedShotIndexes: readonly number[],
  stripSlotIndex: number,
): number | undefined {
  if (stripSlotIndex < 0 || stripSlotIndex >= selectedShotIndexes.length) return undefined;
  return selectedShotIndexes[stripSlotIndex];
}

export function buildCompositionEditorTarget(args: {
  source: CompositionEditorSource;
  shotIndex: number;
  stripSlotIndex?: number;
}): CompositionEditorTarget {
  return {
    shotIndex: args.shotIndex,
    stripSlotIndex: args.source === 'final-strip' ? args.stripSlotIndex : undefined,
    source: args.source,
  };
}

export function compositionEditorTitle(target: CompositionEditorTarget): string {
  if (target.source === 'final-strip' && target.stripSlotIndex != null) {
    return `최종 사진 ${target.stripSlotIndex + 1} · 촬영 #${target.shotIndex}`;
  }
  return `촬영 #${target.shotIndex}`;
}
