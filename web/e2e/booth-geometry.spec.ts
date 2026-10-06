import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, 'screenshots');

const FRAME_CSS = `
.same-space-live-stage,
.same-space-live-stage[data-span='one_cell'],
.same-space-live-stage[data-span='two_cell'],
.same-space-scene,
.same-space-scene[data-span='one_cell'],
.same-space-scene[data-span='two_cell'],
.booth-editor-slot,
.booth-editor-slot[data-span='one_cell'],
.booth-editor-slot[data-span='two_cell'] {
  aspect-ratio: 4 / 3 !important;
  width: 100%;
  background: #ede4f7;
  border-radius: 16px;
}
.booth-stage-canvas { width: 640px; }
.same-space-scene, .booth-editor-slot { width: 360px; }
`;

test.describe('Couple Booth frame geometry (visual)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(shotDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.setContent(`
      <html><head><style>${FRAME_CSS}</style></head>
      <body>
        <div class="booth-stage-canvas">
          <div id="live-stage" class="same-space-live-stage" data-span="two_cell" data-testid="live-stage"></div>
        </div>
        <div id="review-one" class="same-space-scene" data-span="one_cell" data-testid="review-one"></div>
        <div id="review-two" class="same-space-scene" data-span="two_cell" data-testid="review-two"></div>
        <div id="editor-slot" class="booth-editor-slot" data-span="one_cell" data-testid="editor-slot"></div>
      </body></html>
    `);
  });

  test('live stage is always 4:3 two_cell', async ({ page }) => {
    const live = page.getByTestId('live-stage');
    await expect(live).toHaveAttribute('data-span', 'two_cell');
    const aspect = await live.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width / r.height;
    });
    expect(aspect).toBeGreaterThan(1.28);
    expect(aspect).toBeLessThan(1.4);
    await live.screenshot({ path: path.join(shotDir, 'live-two-cell.png') });
  });

  test('review one_cell and two_cell share the same external 4:3 aspect', async ({ page }) => {
    const one = page.getByTestId('review-one');
    const two = page.getByTestId('review-two');
    const oneAspect = await one.evaluate((el) => el.getBoundingClientRect().width / el.getBoundingClientRect().height);
    const twoAspect = await two.evaluate((el) => el.getBoundingClientRect().width / el.getBoundingClientRect().height);
    expect(Math.abs(oneAspect - 4 / 3)).toBeLessThan(0.05);
    expect(Math.abs(twoAspect - 4 / 3)).toBeLessThan(0.05);
    expect(Math.abs(oneAspect - twoAspect)).toBeLessThan(0.02);
    await one.screenshot({ path: path.join(shotDir, 'review-one-cell.png') });
    await two.screenshot({ path: path.join(shotDir, 'review-two-cell.png') });
  });

  test('editor slot one_cell stays 4:3', async ({ page }) => {
    const slot = page.getByTestId('editor-slot');
    const aspect = await slot.evaluate((el) => el.getBoundingClientRect().width / el.getBoundingClientRect().height);
    expect(Math.abs(aspect - 4 / 3)).toBeLessThan(0.05);
    await slot.screenshot({ path: path.join(shotDir, 'editor-slot-one-cell.png') });
  });

  test('toggling data-span does not change outer aspect', async ({ page }) => {
    const stage = page.getByTestId('live-stage');
    const before = await stage.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, a: r.width / r.height };
    });
    await stage.evaluate((el) => el.setAttribute('data-span', 'one_cell'));
    const mid = await stage.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, a: r.width / r.height };
    });
    expect(Math.abs(before.a - mid.a)).toBeLessThan(0.02);
    expect(Math.abs(before.w - mid.w)).toBeLessThan(2);
    expect(Math.abs(before.h - mid.h)).toBeLessThan(2);
  });
});
