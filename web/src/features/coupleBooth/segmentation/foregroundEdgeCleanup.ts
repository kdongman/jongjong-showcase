/**
 * Soften white-matte fringe on semi-transparent cutout edges.
 * Keeps RGB transparent-friendly so dark backgrounds don't show a chalk halo.
 */

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Mutates rgb ImageData in place using the matching alpha mask.
 * Only touches partial-alpha edge pixels; opaque interiors stay intact.
 */
export function decontaminateForegroundEdge(
  rgb: ImageData,
  alpha: Uint8ClampedArray,
): void {
  const { width, height, data } = rgb;
  if (alpha.length < width * height) return;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const a = alpha[i] ?? 0;
      if (a <= 8 || a >= 245) continue;

      const pi = i * 4;
      const r = data[pi]!;
      const g = data[pi + 1]!;
      const b = data[pi + 2]!;
      const lum = luminance(r, g, b);
      // Only decontaminate bright fringe typical of light-matte spill.
      if (lum < 200) continue;

      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sw = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          const na = alpha[ni] ?? 0;
          if (na < 160) continue;
          const npi = ni * 4;
          const weight = na / 255;
          sr += data[npi]! * weight;
          sg += data[npi + 1]! * weight;
          sb += data[npi + 2]! * weight;
          sw += weight;
        }
      }
      if (sw <= 0) {
        // No solid neighbour — gently pull toward mid-gray instead of pure white.
        const t = (245 - a) / 245;
        data[pi] = Math.round(r * (1 - t * 0.55) + 96 * t * 0.55);
        data[pi + 1] = Math.round(g * (1 - t * 0.55) + 90 * t * 0.55);
        data[pi + 2] = Math.round(b * (1 - t * 0.55) + 100 * t * 0.55);
        continue;
      }
      const fr = sr / sw;
      const fg = sg / sw;
      const fb = sb / sw;
      const edge = 1 - a / 255;
      const mix = Math.min(0.85, 0.35 + edge * 0.55);
      data[pi] = Math.round(r * (1 - mix) + fr * mix);
      data[pi + 1] = Math.round(g * (1 - mix) + fg * mix);
      data[pi + 2] = Math.round(b * (1 - mix) + fb * mix);
    }
  }
}
