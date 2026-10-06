/** Canonical Room object rotation. Source-image EXIF is never mixed in here. */

export const ROOM_ROTATION_SNAP_DEGREES = 3;
const SNAP_TARGETS = [0, 90, 180, 270] as const;

export function radiansToDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

export function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/** Shortest signed delta from `previous` to `current` in radians, in (-π, π]. */
export function unwrapAngleDelta(current: number, previous: number): number {
  let delta = current - previous;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Persistable canonical range (-180, 180]. Visual angle is unchanged.
 * Gesture code must keep an unwrapped accumulator and only call this on commit.
 */
export function normalizeRotationDegrees(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let rotation = value % 360;
  if (rotation <= -180) rotation += 360;
  if (rotation > 180) rotation -= 360;
  return rotation;
}

function shortestDegreesDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return delta;
}

/**
 * Weak magnetic snap to 0/90/180/270 only. Arbitrary angles such as 37° stay put.
 * Returns an unwrapped angle so a full-turn accumulator does not jump.
 */
export function magneticSnapRotation(degrees: number, threshold = ROOM_ROTATION_SNAP_DEGREES): number {
  if (!Number.isFinite(degrees)) return 0;
  const mod = ((degrees % 360) + 360) % 360;
  let bestDelta = 0;
  let snapped = false;
  for (const target of SNAP_TARGETS) {
    const delta = shortestDegreesDelta(mod, target);
    if (Math.abs(delta) <= threshold && (!snapped || Math.abs(delta) < Math.abs(bestDelta))) {
      bestDelta = delta;
      snapped = true;
    }
  }
  if (!snapped) return degrees;
  const next = degrees + bestDelta;
  return Math.abs(next - Math.round(next)) < 1e-9 ? Math.round(next) : next;
}

export function pointerAngleRadians(pointerX: number, pointerY: number, centerX: number, centerY: number): number {
  return Math.atan2(pointerY - centerY, pointerX - centerX);
}

export function rotateVector(x: number, y: number, degrees: number): { x: number; y: number } {
  const radians = degreesToRadians(degrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** Canonical Room object uniform-scale gesture: immutable start plus total diagonal drag. */
export function roomUniformScaleFromDrag(
  startScale: number,
  deltaX: number,
  deltaY: number,
  roomWidth: number,
  roomHeight: number,
  minScale: number,
  maxScale: number,
): number {
  const raw = startScale + (deltaX + deltaY) / Math.max(90, Math.min(roomWidth, roomHeight));
  return Math.max(minScale, Math.min(maxScale, Number.isFinite(raw) ? raw : startScale));
}
