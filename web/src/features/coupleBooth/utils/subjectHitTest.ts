import type { SameSpaceCompositionSlot } from '@shared/sameSpaceLayoutSpec';

export type SubjectHitRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SubjectHitCandidate = {
  slot: SameSpaceCompositionSlot;
  rect: SubjectHitRect;
  /** True when pointer lands on non-transparent subject pixels (or unknown → treat as hit). */
  alphaHit: boolean;
};

const ALPHA_HIT_THRESHOLD = 12;

export function pointInRect(x: number, y: number, rect: SubjectHitRect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * Resolve which subject to select/drag under overlap.
 * - Prefer currently selected subject when still under the pointer (and alpha-hit if known).
 * - Else topmost alpha hit (drawOrder last = top).
 * - Short click on overlap can cycle via `preferCycleFrom`.
 */
export function resolveOverlappingSubjectHit(args: {
  candidates: SubjectHitCandidate[];
  /** Draw order bottom → top; last entry is visually topmost. */
  drawOrder: SameSpaceCompositionSlot[];
  selectedSlot: SameSpaceCompositionSlot | null;
  /** When set, cycle away from this slot among overlapping alpha hits. */
  preferCycleFrom?: SameSpaceCompositionSlot | null;
}): SameSpaceCompositionSlot | null {
  const hits = args.candidates.filter((c) => c.alphaHit);
  if (hits.length === 0) return null;

  const hitSlots = new Set(hits.map((h) => h.slot));

  if (args.preferCycleFrom && hitSlots.has(args.preferCycleFrom) && hits.length > 1) {
    const others = hits.filter((h) => h.slot !== args.preferCycleFrom);
    const topOther = [...args.drawOrder].reverse().find((slot) => others.some((h) => h.slot === slot));
    if (topOther) return topOther;
  }

  if (args.selectedSlot && hitSlots.has(args.selectedSlot)) {
    return args.selectedSlot;
  }

  const topmost = [...args.drawOrder].reverse().find((slot) => hitSlots.has(slot));
  return topmost ?? hits[0]!.slot;
}

/**
 * Sample alpha from source image mapped through dest rect.
 * Returns 0 outside dest or on transparent pixels.
 */
export function sampleDestAlpha(
  imageData: ImageData | null,
  dest: SubjectHitRect,
  canvasX: number,
  canvasY: number,
): number {
  if (!imageData) return ALPHA_HIT_THRESHOLD; // unknown → allow bbox hit
  if (!pointInRect(canvasX, canvasY, dest)) return 0;
  const u = (canvasX - dest.x) / Math.max(1e-6, dest.width);
  const v = (canvasY - dest.y) / Math.max(1e-6, dest.height);
  const sx = Math.min(imageData.width - 1, Math.max(0, Math.floor(u * imageData.width)));
  const sy = Math.min(imageData.height - 1, Math.max(0, Math.floor(v * imageData.height)));
  return imageData.data[(sy * imageData.width + sx) * 4 + 3] ?? 0;
}

export function isOpaqueAlpha(alpha: number): boolean {
  return alpha >= ALPHA_HIT_THRESHOLD;
}

/**
 * Build hit candidates for all subjects under a canvas point.
 * Transparent bbox regions do not count as alpha hits.
 */
export function collectSubjectHitsAtPoint(args: {
  point: { x: number; y: number };
  slots: SameSpaceCompositionSlot[];
  getPersonDest: (slot: SameSpaceCompositionSlot) => SubjectHitRect | null;
  getDest: (slot: SameSpaceCompositionSlot) => SubjectHitRect | null;
  getAlphaData: (slot: SameSpaceCompositionSlot) => ImageData | null;
}): SubjectHitCandidate[] {
  const out: SubjectHitCandidate[] = [];
  for (const slot of args.slots) {
    const personDest = args.getPersonDest(slot);
    if (!personDest || !pointInRect(args.point.x, args.point.y, personDest)) continue;
    const dest = args.getDest(slot) ?? personDest;
    const alpha = sampleDestAlpha(args.getAlphaData(slot), dest, args.point.x, args.point.y);
    out.push({
      slot,
      rect: personDest,
      alphaHit: isOpaqueAlpha(alpha),
    });
  }
  return out;
}
