import { createPersonCutout } from '../segmentation/PersonSegmenter';

export type HighResFrameCapture = {
  blob: Blob;
  width: number;
  height: number;
  videoWidth: number;
  videoHeight: number;
};

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('CANVAS_TO_BLOB_EMPTY'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

/**
 * Capture the live <video> at its native videoWidth×videoHeight.
 * Never downscale to the live segmentation preview size (320 long-edge).
 */
export async function captureFullResVideoFrame(
  video: HTMLVideoElement,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!(width > 0) || !(height > 0)) {
    throw new Error('VIDEO_FRAME_UNAVAILABLE');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNSUPPORTED');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, 0, 0, width, height);
  return { canvas, width, height };
}

/**
 * One-shot high-resolution person cutout for shutter capture.
 * Uses IMAGE-mode segmentation on the native video frame — separate from the
 * live VIDEO-mode 320px preview pipeline.
 */
export async function captureHighResPersonCutoutFromVideo(
  video: HTMLVideoElement,
): Promise<HighResFrameCapture> {
  const frame = await captureFullResVideoFrame(video);
  const sourceBlob = await canvasToPngBlob(frame.canvas);
  const cutoutBlob = await createPersonCutout(sourceBlob);
  let cutoutWidth = frame.width;
  let cutoutHeight = frame.height;
  try {
    const bitmap = await createImageBitmap(cutoutBlob);
    cutoutWidth = bitmap.width;
    cutoutHeight = bitmap.height;
    bitmap.close();
  } catch {
    /* keep frame size */
  }
  return {
    blob: cutoutBlob,
    width: cutoutWidth,
    height: cutoutHeight,
    videoWidth: frame.width,
    videoHeight: frame.height,
  };
}
