/**
 * Stale stage cleanups must not clear a newer stage's registered element.
 * Only the owner that registered `expected` may clear it.
 */
export function shouldClearLocalVideoElement(
  current: HTMLVideoElement | null | undefined,
  expected: HTMLVideoElement | null | undefined,
): boolean {
  return Boolean(expected) && current === expected;
}
