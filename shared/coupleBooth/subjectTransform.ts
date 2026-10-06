/**
 * Per-subject edit transform shared by live stage, Review, and export.
 * Coordinates are normalized against the external shot frame (1200×900).
 */
export type SubjectTransformMode = 'auto' | 'manual';

export type SubjectTransform = {
  offsetX: number;
  offsetY: number;
  scale: number;
  /** auto: base placement may update; manual: user edits are authoritative. */
  mode: SubjectTransformMode;
};

export const DEFAULT_SUBJECT_TRANSFORM: SubjectTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  mode: 'auto',
};

export const SUBJECT_SCALE_MIN = 0.2;
export const SUBJECT_SCALE_MAX = 5;

export function clampSubjectScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(SUBJECT_SCALE_MAX, Math.max(SUBJECT_SCALE_MIN, scale));
}

export function clampSubjectTransform(
  input: Partial<SubjectTransform> | null | undefined,
): SubjectTransform {
  const mode = input?.mode === 'manual' ? 'manual' : 'auto';
  return {
    offsetX: Number.isFinite(input?.offsetX) ? Number(input!.offsetX) : 0,
    offsetY: Number.isFinite(input?.offsetY) ? Number(input!.offsetY) : 0,
    scale: clampSubjectScale(Number.isFinite(input?.scale) ? Number(input!.scale) : 1),
    mode,
  };
}

export function markSubjectManual(
  current: Partial<SubjectTransform> | null | undefined,
  patch: Partial<Pick<SubjectTransform, 'offsetX' | 'offsetY' | 'scale'>>,
): SubjectTransform {
  return clampSubjectTransform({
    ...current,
    ...patch,
    mode: 'manual',
  });
}

export function resetSubjectTransform(): SubjectTransform {
  return { ...DEFAULT_SUBJECT_TRANSFORM };
}

/** Legacy SubjectTransform { x, y, scale } → offset form. */
export function subjectTransformFromManual(offset: {
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  mode?: SubjectTransformMode;
  x?: number;
  y?: number;
} | null | undefined): SubjectTransform {
  return clampSubjectTransform({
    offsetX: offset?.offsetX ?? offset?.x ?? 0,
    offsetY: offset?.offsetY ?? offset?.y ?? 0,
    scale: offset?.scale ?? 1,
    mode: offset?.mode,
  });
}

export function manualFromSubjectTransform(transform: SubjectTransform): {
  offsetX: number;
  offsetY: number;
  scale: number;
  mode: SubjectTransformMode;
} {
  const clamped = clampSubjectTransform(transform);
  return {
    offsetX: clamped.offsetX,
    offsetY: clamped.offsetY,
    scale: clamped.scale,
    mode: clamped.mode,
  };
}

export function scaleSubjectAboutAnchor(input: {
  current: SubjectTransform;
  anchorX: number;
  anchorY: number;
  nextScale: number;
}): SubjectTransform {
  void input.anchorX;
  void input.anchorY;
  return markSubjectManual(input.current, { scale: input.nextScale });
}
