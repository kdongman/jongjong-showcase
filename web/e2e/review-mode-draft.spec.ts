import { expect, test } from '@playwright/test';

/**
 * Review mode draft SoT — simulates oscillation that the video showed at 00:10.
 * Local draft must not be overwritten by a stale server one_cell echo.
 */
test.describe('Review sceneSpanMode draft SoT', () => {
  test('stale server one_cell does not overwrite local two_cell draft', async ({ page }) => {
    await page.setContent(`
      <html><body>
        <button id="one">1칸</button>
        <button id="two">2칸</button>
        <div id="mode"></div>
        <script>
          let reviewSceneSpanMode = 'two_cell';
          let reviewSpanDirty = false;
          let serverSpan = 'one_cell';
          const render = () => { document.getElementById('mode').textContent = reviewSceneSpanMode; };
          const select = (mode) => {
            if (reviewSceneSpanMode === mode) return;
            reviewSpanDirty = true;
            reviewSceneSpanMode = mode;
            render();
          };
          // Stale hydrate (as after saveComposition / realtime)
          const hydrateFromServer = () => {
            if (reviewSpanDirty) return; // SoT: keep local draft
            reviewSceneSpanMode = serverSpan;
            render();
          };
          document.getElementById('one').onclick = () => select('one_cell');
          document.getElementById('two').onclick = () => select('two_cell');
          render();
          window.__hydrate = hydrateFromServer;
          window.__getMode = () => reviewSceneSpanMode;
          // Click two then one then hydrate should keep one (dirty)
          // Click two, hydrate with one_cell server should keep two
        </script>
      </body></html>
    `);

    // Start dirty by changing away from initial, then back to two_cell.
    await page.click('#one');
    expect(await page.evaluate(() => window.__getMode())).toBe('one_cell');
    await page.click('#two');
    expect(await page.evaluate(() => window.__getMode())).toBe('two_cell');
    await page.evaluate(() => window.__hydrate());
    expect(await page.evaluate(() => window.__getMode())).toBe('two_cell');

    await page.click('#one');
    expect(await page.evaluate(() => window.__getMode())).toBe('one_cell');
    // Simulate 20 rapid toggles
    for (let i = 0; i < 20; i += 1) {
      await page.click(i % 2 === 0 ? '#two' : '#one');
    }
    const finalMode = await page.evaluate(() => window.__getMode());
    await page.evaluate(() => window.__hydrate());
    expect(await page.evaluate(() => window.__getMode())).toBe(finalMode);
  });

  test('one click changes mode exactly once', async ({ page }) => {
    await page.setContent(`
      <html><body>
        <button id="one">1칸</button>
        <div id="count">0</div>
        <script>
          let mode = 'two_cell';
          let changes = 0;
          document.getElementById('one').onclick = () => {
            if (mode === 'one_cell') return;
            mode = 'one_cell';
            changes += 1;
            document.getElementById('count').textContent = String(changes);
          };
        </script>
      </body></html>
    `);
    await page.click('#one');
    await page.click('#one');
    await page.click('#one');
    expect(await page.locator('#count').textContent()).toBe('1');
  });
});
