import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.join(here, '..', 'src', 'index.css');

function relativeLuminance(color: string): number {
  const channels = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

test('Same Space labels remain readable in the immersive dark live shell', async ({ page }) => {
  await page.setContent(`
    <main class="card" style="background:#14111a">
      <div class="booth-shared-scene-picker"><strong>Scene</strong></div>
      <div class="booth-lighting-control">
        <span>Match lighting</span>
        <button class="booth-lighting-toggle is-active">On ✓</button>
      </div>
    </main>
  `);
  await page.addStyleTag({ path: cssPath });

  const colors = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.card')!;
    const scene = document.querySelector<HTMLElement>('.booth-shared-scene-picker')!;
    const lighting = document.querySelector<HTMLElement>('.booth-lighting-control')!;
    const toggle = document.querySelector<HTMLElement>('.booth-lighting-toggle')!;
    return {
      card: getComputedStyle(card).backgroundColor,
      scene: getComputedStyle(scene).color,
      lighting: getComputedStyle(lighting).color,
      toggleBackground: getComputedStyle(toggle).backgroundColor,
      toggle: getComputedStyle(toggle).color,
    };
  });

  expect(contrastRatio(colors.scene, colors.card)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colors.lighting, colors.card)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colors.toggle, colors.toggleBackground)).toBeGreaterThanOrEqual(4.5);
});
