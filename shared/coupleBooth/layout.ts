import { FINAL_OUTPUT_HEIGHT, FINAL_OUTPUT_WIDTH } from './types';
import {
  LEGACY_BOOTH_SCENE_SPAN_MODE,
  SHOT_FRAME_LOGICAL_HEIGHT,
  DEFAULT_CAPTURE_VIEWPORT_MODE,
  getCaptureFrameDimensions,
  type CaptureViewportMode,
  type BoothSceneSpanMode,
} from './boothSceneSpec';

/** Backing-store multiplier for Same Space export (CSS display stays logical). */
export const BOOTH_EXPORT_SCALE = 2;

export type BoothStripLayout = {
  width: number;
  height: number;
  paddingX: number;
  headerHeight: number;
  footerHeight: number;
  gap: number;
  cellWidth: number;
  cellHeight: number;
  brandY: number;
  dateY: number;
  taglineY: number;
  rows: Array<{ y: number; leftX: number; rightX: number }>;
  sameSpaceFullWidth?: boolean;
  sceneSpanMode?: BoothSceneSpanMode;
  logicalCellWidth?: number;
  logicalCellHeight?: number;
  exportScale?: number;
};

export function computeBoothStripLayout(
  width = FINAL_OUTPUT_WIDTH,
  height = FINAL_OUTPUT_HEIGHT,
): BoothStripLayout {
  const paddingX = Math.round(width * 0.055);
  const headerHeight = Math.round(height * 0.08);
  const footerHeight = Math.round(height * 0.1);
  const gap = Math.round(width * 0.018);
  const contentTop = headerHeight;
  const contentBottom = height - footerHeight;
  const contentHeight = contentBottom - contentTop;
  const rowGap = gap;
  const cellHeight = Math.floor((contentHeight - rowGap * 3) / 4);
  const cellWidth = Math.floor((width - paddingX * 2 - gap) / 2);
  const leftX = paddingX;
  const rightX = paddingX + cellWidth + gap;
  const rows = Array.from({ length: 4 }, (_, index) => ({
    y: contentTop + index * (cellHeight + rowGap),
    leftX,
    rightX,
  }));
  return {
    width,
    height,
    paddingX,
    headerHeight,
    footerHeight,
    gap,
    cellWidth,
    cellHeight,
    brandY: Math.round(headerHeight * 0.42),
    dateY: height - footerHeight + Math.round(footerHeight * 0.32),
    taglineY: height - footerHeight + Math.round(footerHeight * 0.62),
    rows,
  };
}

export type SameSpaceStripLayoutOptions = {
  exportScale?: number;
  useLogicalScene?: boolean;
  captureViewportMode?: CaptureViewportMode;
  /** Force the final canvas dimensions while retaining the current composition geometry. */
  outputHeight?: number;
};

/**
 * Same Space strip: four stacked 4:3 scenes.
 * sceneSpanMode changes composition packing only — cell outer size is always
 * SHOT_FRAME (1200×900) × exportScale.
 */
export function computeSameSpaceStripLayout(
  outputWidthOrSpanMode: number | BoothSceneSpanMode = FINAL_OUTPUT_WIDTH,
  spanModeOrOptions: BoothSceneSpanMode | SameSpaceStripLayoutOptions = LEGACY_BOOTH_SCENE_SPAN_MODE,
  maybeOptions?: SameSpaceStripLayoutOptions,
): BoothStripLayout {
  let outputWidth = FINAL_OUTPUT_WIDTH;
  let spanMode: BoothSceneSpanMode = LEGACY_BOOTH_SCENE_SPAN_MODE;
  let options: SameSpaceStripLayoutOptions = {};

  if (typeof outputWidthOrSpanMode === 'string') {
    spanMode = outputWidthOrSpanMode;
    options = (typeof spanModeOrOptions === 'object' && spanModeOrOptions !== null
      ? spanModeOrOptions
      : {}) as SameSpaceStripLayoutOptions;
  } else {
    outputWidth = outputWidthOrSpanMode;
    if (typeof spanModeOrOptions === 'string') {
      spanMode = spanModeOrOptions;
      options = maybeOptions ?? {};
    } else {
      options = spanModeOrOptions ?? {};
    }
  }

  const exportScale = Math.max(1, options.exportScale ?? 1);
  const useLogicalScene = options.useLogicalScene ?? exportScale > 1;
  const viewportMode = options.captureViewportMode ?? DEFAULT_CAPTURE_VIEWPORT_MODE;
  const frame = getCaptureFrameDimensions(viewportMode);

  // External cell is ALWAYS the 4:3 shot frame — never 2:3 one_cell canvas.
  const logicalSceneWidth = useLogicalScene
    ? frame.width
    : Math.round(outputWidth * 0.89);
  const logicalSceneHeight = useLogicalScene
    ? SHOT_FRAME_LOGICAL_HEIGHT
    : Math.round(logicalSceneWidth * frame.height / frame.width);

  let sceneWidth = options.outputHeight
    ? Math.max(1, outputWidth - Math.round(outputWidth * 0.06) * 2)
    : Math.round(logicalSceneWidth * exportScale);
  let sceneHeight = Math.round(logicalSceneHeight * exportScale);
  const paddingX = options.outputHeight
    ? Math.round(outputWidth * 0.06)
    : Math.round(sceneWidth * 0.06);
  const width = options.outputHeight ? outputWidth : sceneWidth + paddingX * 2;
  let gap = Math.max(6, Math.round(sceneWidth * 0.025));
  const headerHeight = Math.round(sceneWidth * 0.14);
  const footerHeight = Math.round(sceneWidth * 0.16);
  const requestedHeight = options.outputHeight;
  const height = requestedHeight && requestedHeight > headerHeight + footerHeight + gap * 3
    ? requestedHeight
    : headerHeight + footerHeight + sceneHeight * 4 + gap * 3;
  if (requestedHeight && requestedHeight > headerHeight + footerHeight + gap * 3) {
    const maxSceneHeight = Math.floor((requestedHeight - headerHeight - footerHeight - gap * 3) / 4);
    const frameAspect = frame.width / frame.height;
    sceneWidth = Math.min(sceneWidth, Math.floor(maxSceneHeight * frameAspect));
    sceneHeight = Math.min(maxSceneHeight, Math.round(sceneWidth / frameAspect));
    // Use otherwise-unused vertical room as inter-row spacing. Never stretch a
    // canonical 4:3/3:4 frame to fill the fixed 1200×3600 strip.
    gap = Math.max(6, Math.floor((requestedHeight - headerHeight - footerHeight - sceneHeight * 4) / 3));
  }
  const finalSceneHeight = sceneHeight;
  const leftX = Math.round((width - sceneWidth) / 2);
  const rows = Array.from({ length: 4 }, (_, index) => ({
    y: headerHeight + index * (finalSceneHeight + gap),
    leftX,
    rightX: leftX,
  }));
  return {
    width,
    height,
    paddingX,
    headerHeight,
    footerHeight,
    gap,
    cellWidth: sceneWidth,
    cellHeight: finalSceneHeight,
    brandY: Math.round(headerHeight * 0.42),
    dateY: height - footerHeight + Math.round(footerHeight * 0.32),
    taglineY: height - footerHeight + Math.round(footerHeight * 0.62),
    rows,
    sameSpaceFullWidth: true,
    sceneSpanMode: spanMode,
    logicalCellWidth: logicalSceneWidth,
    logicalCellHeight: logicalSceneHeight,
    exportScale,
  };
}

export function computeCenterCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!sourceWidth || !sourceHeight) {
    return { sx: 0, sy: 0, sw: targetWidth, sh: targetHeight };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const sw = sourceHeight * targetRatio;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }
  const sh = sourceWidth / targetRatio;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}

/** @deprecated Prefer computeSameSpaceStripLayout. */
export function computeLegacySameSpaceStripLayout(width = FINAL_OUTPUT_WIDTH): BoothStripLayout {
  return computeSameSpaceStripLayout(width, 'two_cell', { useLogicalScene: false, exportScale: 1 });
}
