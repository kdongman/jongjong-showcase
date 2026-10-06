import { REQUIRED_SELECTED_SHOTS, TOTAL_SHOTS } from './types';

/** Toggle a shot into/out of the ordered selection (max 4). */
export function toggleShotSelection(selected: number[], shotIndex: number): number[] {
  if (shotIndex < 1 || shotIndex > TOTAL_SHOTS) return selected;
  const existing = selected.indexOf(shotIndex);
  if (existing >= 0) {
    return selected.filter((value) => value !== shotIndex);
  }
  if (selected.length >= REQUIRED_SELECTED_SHOTS) return selected;
  return [...selected, shotIndex];
}

/** 1-based order label for a selected shot, or null if unselected. */
export function selectionOrderLabel(selected: number[], shotIndex: number): number | null {
  const index = selected.indexOf(shotIndex);
  return index >= 0 ? index + 1 : null;
}

export function canSelectMore(selected: number[]): boolean {
  return selected.length < REQUIRED_SELECTED_SHOTS;
}

export function isExactSelection(selected: number[]): boolean {
  return selected.length === REQUIRED_SELECTED_SHOTS && new Set(selected).size === REQUIRED_SELECTED_SHOTS;
}

export function moveSelectedShot(selected: number[], fromIndex: number, toIndex: number): number[] {
  if (fromIndex < 0 || fromIndex >= selected.length || toIndex < 0 || toIndex >= selected.length) {
    return selected;
  }
  const next = [...selected];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function moveSelectedShotUp(selected: number[], shotIndex: number): number[] {
  const index = selected.indexOf(shotIndex);
  if (index <= 0) return selected;
  return moveSelectedShot(selected, index, index - 1);
}

export function moveSelectedShotDown(selected: number[], shotIndex: number): number[] {
  const index = selected.indexOf(shotIndex);
  if (index < 0 || index >= selected.length - 1) return selected;
  return moveSelectedShot(selected, index, index + 1);
}

/** Selection/order changes always clear both approvals. */
export function approvalsAfterSelectionChange(): { hostApproved: boolean; guestApproved: boolean } {
  return { hostApproved: false, guestApproved: false };
}
