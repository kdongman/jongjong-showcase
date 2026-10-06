/**
 * Canonical Couple Booth scene geometry.
 *
 * External shot FRAME is always 1200×900 (4:3).
 * sceneSpanMode only changes the horizontal COMPOSITION SPAN inside that frame:
 * - one_cell: ~half-width span (compact couple packing)
 * - two_cell: full-width span (wide pose room)
 */

export type BoothSceneSpanMode = 'one_cell' | 'two_cell';
export type CaptureViewportMode = 'desktop' | 'mobile';

export const DEFAULT_CAPTURE_VIEWPORT_MODE: CaptureViewportMode = 'desktop';
export const CAPTURE_FRAME_DIMENSIONS: Record<CaptureViewportMode, { width: number; height: number }> = {
  desktop: { width: 1200, height: 900 },
  mobile: { width: 900, height: 1200 },
};

export function isCaptureViewportMode(value: unknown): value is CaptureViewportMode {
  return value === 'desktop' || value === 'mobile';
}

export function parseCaptureViewportMode(
  value: unknown,
  fallback: CaptureViewportMode = DEFAULT_CAPTURE_VIEWPORT_MODE,
): CaptureViewportMode {
  return isCaptureViewportMode(value) ? value : fallback;
}

export function getCaptureFrameDimensions(mode: CaptureViewportMode = DEFAULT_CAPTURE_VIEWPORT_MODE) {
  return CAPTURE_FRAME_DIMENSIONS[mode];
}

export const BOOTH_SCENE_SPAN_MODES: readonly BoothSceneSpanMode[] = ['one_cell', 'two_cell'];

/** External shot / live / Review / export frame — always 4:3. */
export const SHOT_FRAME_LOGICAL_WIDTH = 1200;
export const SHOT_FRAME_LOGICAL_HEIGHT = 900;
export const SHOT_FRAME_ASPECT_RATIO = SHOT_FRAME_LOGICAL_WIDTH / SHOT_FRAME_LOGICAL_HEIGHT;

/** @deprecated Use SHOT_FRAME_* — kept as aliases. */
export const BOOTH_SCENE_ASPECT_RATIO = SHOT_FRAME_ASPECT_RATIO;
export const BOOTH_SCENE_LOGICAL_WIDTH = SHOT_FRAME_LOGICAL_WIDTH;
export const BOOTH_SCENE_LOGICAL_HEIGHT = SHOT_FRAME_LOGICAL_HEIGHT;

/**
 * one_cell composition span width in logical pixels (half of frame).
 * NOT an external canvas size — only the packing corridor inside the 4:3 frame.
 */
export const BOOTH_ONE_CELL_SPAN_WIDTH = 600;
export const BOOTH_ONE_CELL_SPAN_HEIGHT = SHOT_FRAME_LOGICAL_HEIGHT;
/** @deprecated Use BOOTH_ONE_CELL_SPAN_* — historical misnamed “logical frame”. */
export const BOOTH_ONE_CELL_LOGICAL_WIDTH = BOOTH_ONE_CELL_SPAN_WIDTH;
export const BOOTH_ONE_CELL_LOGICAL_HEIGHT = BOOTH_ONE_CELL_SPAN_HEIGHT;
export const BOOTH_ONE_CELL_ASPECT_RATIO = BOOTH_ONE_CELL_SPAN_WIDTH / BOOTH_ONE_CELL_SPAN_HEIGHT;

export const DEFAULT_BOOTH_SCENE_SPAN_MODE: BoothSceneSpanMode = 'two_cell';
export const LEGACY_BOOTH_SCENE_SPAN_MODE: BoothSceneSpanMode = 'two_cell';

/** Live + capture always use this — Review may override to one_cell packing. */
export const LIVE_CAPTURE_SCENE_SPAN_MODE: BoothSceneSpanMode = 'two_cell';

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SceneFrameSpec = {
  spanMode: BoothSceneSpanMode;
  /** Always 1200. */
  frameWidth: number;
  /** Always 900. */
  frameHeight: number;
  /** Always 4/3. */
  aspectRatio: number;
  /** Composition corridor inside the frame (normalized 0–1). */
  spanRect: NormalizedRect;
  labelKo: string;
  descriptionKo: string;
};

/** @deprecated Prefer SceneFrameSpec — width/height are the external frame. */
export type BoothSceneSpec = {
  spanMode: BoothSceneSpanMode;
  aspectRatio: number;
  width: number;
  height: number;
  safeInsets: NormalizedRect;
  labelKo: string;
  descriptionKo: string;
};

export function getSceneFrameSpec(
  mode: BoothSceneSpanMode = LEGACY_BOOTH_SCENE_SPAN_MODE,
  viewportMode: CaptureViewportMode = DEFAULT_CAPTURE_VIEWPORT_MODE,
): SceneFrameSpec {
  const frame = getCaptureFrameDimensions(viewportMode);
  if (mode === 'one_cell') {
    const spanWidthNorm = 0.5;
    return {
      spanMode: 'one_cell',
      frameWidth: frame.width,
      frameHeight: frame.height,
      aspectRatio: frame.width / frame.height,
      spanRect: {
        x: (1 - spanWidthNorm) / 2,
        y: 0,
        width: spanWidthNorm,
        height: 1,
      },
      labelKo: '1칸',
      descriptionKo: '한 칸 안에 둘이 가까이 담기는 구도',
    };
  }
  return {
    spanMode: 'two_cell',
    frameWidth: frame.width,
    frameHeight: frame.height,
    aspectRatio: frame.width / frame.height,
    spanRect: { x: 0, y: 0, width: 1, height: 1 },
    labelKo: '2칸',
    descriptionKo: '두 칸을 사용해 넓게 포즈를 잡는 구도',
  };
}

export const BOOTH_SCENE_SPEC_BY_SPAN: Record<BoothSceneSpanMode, BoothSceneSpec> = {
  two_cell: {
    spanMode: 'two_cell',
    aspectRatio: SHOT_FRAME_ASPECT_RATIO,
    width: SHOT_FRAME_LOGICAL_WIDTH,
    height: SHOT_FRAME_LOGICAL_HEIGHT,
    safeInsets: { x: 0.02, y: 0.04, width: 0.96, height: 0.92 },
    labelKo: '2칸',
    descriptionKo: '두 칸을 사용해 넓게 포즈를 잡는 구도',
  },
  one_cell: {
    spanMode: 'one_cell',
    // External frame stays 4:3 — span is half-width inside the frame.
    aspectRatio: SHOT_FRAME_ASPECT_RATIO,
    width: SHOT_FRAME_LOGICAL_WIDTH,
    height: SHOT_FRAME_LOGICAL_HEIGHT,
    safeInsets: { x: 0.02, y: 0.04, width: 0.96, height: 0.92 },
    labelKo: '1칸',
    descriptionKo: '한 칸 안에 둘이 가까이 담기는 구도',
  },
};

/** @deprecated Prefer getSceneFrameSpec / sceneSpecForSpanMode. */
export const BOOTH_SCENE_SPEC: BoothSceneSpec = BOOTH_SCENE_SPEC_BY_SPAN.two_cell;

export function isBoothSceneSpanMode(value: unknown): value is BoothSceneSpanMode {
  return value === 'one_cell' || value === 'two_cell';
}

export function parseBoothSceneSpanMode(
  value: unknown,
  fallback: BoothSceneSpanMode = LEGACY_BOOTH_SCENE_SPAN_MODE,
): BoothSceneSpanMode {
  // Explicit one_cell only — missing/null/undefined → two_cell (live/capture policy).
  return isBoothSceneSpanMode(value) ? value : fallback;
}

export function sceneSpecForSpanMode(
  mode: BoothSceneSpanMode = LEGACY_BOOTH_SCENE_SPAN_MODE,
  viewportMode: CaptureViewportMode = DEFAULT_CAPTURE_VIEWPORT_MODE,
): BoothSceneSpec {
  const frame = getCaptureFrameDimensions(viewportMode);
  const base = BOOTH_SCENE_SPEC_BY_SPAN[mode];
  return viewportMode === DEFAULT_CAPTURE_VIEWPORT_MODE
    ? base
    : { ...base, width: frame.width, height: frame.height, aspectRatio: frame.width / frame.height };
}

export function sceneSizeForWidth(
  width: number,
  _spanMode: BoothSceneSpanMode = LEGACY_BOOTH_SCENE_SPAN_MODE,
  viewportMode: CaptureViewportMode = DEFAULT_CAPTURE_VIEWPORT_MODE,
): { width: number; height: number } {
  void _spanMode;
  const w = Math.max(1, Math.round(width));
  const frame = getCaptureFrameDimensions(viewportMode);
  return { width: w, height: Math.max(1, Math.round(w * frame.height / frame.width)) };
}

/**
 * Letterbox the external 4:3 shot frame into a CSS container.
 * sceneSpanMode does not change the display aspect — only composition span.
 */
export function fitBoothSceneCssSize(
  containerWidth: number,
  containerHeight: number,
  _spanMode?: BoothSceneSpanMode,
  viewportMode: CaptureViewportMode = DEFAULT_CAPTURE_VIEWPORT_MODE,
): { cssWidth: number; cssHeight: number; aspectRatio: number } {
  void _spanMode;
  const frame = getCaptureFrameDimensions(viewportMode);
  const aspect = frame.width / frame.height;
  const maxW = Math.max(1, containerWidth);
  const maxH = Math.max(1, containerHeight);
  let cssWidth = maxW;
  let cssHeight = cssWidth / aspect;
  if (cssHeight > maxH) {
    cssHeight = maxH;
    cssWidth = cssHeight * aspect;
  }
  return {
    cssWidth: Math.max(1, Math.round(cssWidth)),
    cssHeight: Math.max(1, Math.round(cssHeight)),
    aspectRatio: aspect,
  };
}

export function isUniformScale(scaleX: number, scaleY: number, epsilon = 1e-6): boolean {
  return Math.abs(scaleX - scaleY) <= epsilon;
}

export function uniformFitScale(
  contentWidth: number,
  contentHeight: number,
  maxWidth: number,
  maxHeight: number,
): number {
  if (!(contentWidth > 0) || !(contentHeight > 0)) return 1;
  return Math.min(maxWidth / contentWidth, maxHeight / contentHeight);
}
