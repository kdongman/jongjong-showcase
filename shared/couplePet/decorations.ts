export const MAX_PET_DECORATIONS = 2;

/** Runtime clamp used by UI, state updates, and canvas export. */
export function clampPetDecorations<T>(items: T[], max = MAX_PET_DECORATIONS): T[] {
  if (!Array.isArray(items)) return [];
  if (items.length <= max) return items;
  return items.slice(0, max);
}
