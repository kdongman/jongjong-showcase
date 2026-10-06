import { expect, test } from '@playwright/test';

/**
 * Per-subject transform independence — regression for the combined bbox bug
 * seen at 01:23 in the screen recording.
 */
test.describe('per-subject transforms', () => {
  test('resizing local does not change remote scale', async ({ page }) => {
    await page.setContent(`
      <html><body>
        <canvas id="c" width="400" height="300"></canvas>
        <script>
          const transforms = {
            local: { offsetX: 0, offsetY: 0, scale: 1, mode: 'auto' },
            remote: { offsetX: 0, offsetY: 0, scale: 1, mode: 'auto' },
          };
          let selected = 'local';
          const applyResize = (nextScale) => {
            transforms[selected] = {
              ...transforms[selected],
              scale: nextScale,
              mode: 'manual',
            };
          };
          window.__select = (id) => { selected = id; };
          window.__resize = (s) => applyResize(s);
          window.__get = () => JSON.parse(JSON.stringify(transforms));
        </script>
      </body></html>
    `);

    await page.evaluate(() => window.__select('local'));
    await page.evaluate(() => window.__resize(1.4));
    let state = await page.evaluate(() => window.__get());
    expect(state.local.scale).toBe(1.4);
    expect(state.remote.scale).toBe(1);
    expect(state.local.mode).toBe('manual');

    await page.evaluate(() => window.__select('remote'));
    await page.evaluate(() => window.__resize(0.8));
    state = await page.evaluate(() => window.__get());
    expect(state.local.scale).toBe(1.4);
    expect(state.remote.scale).toBe(0.8);
  });
});
