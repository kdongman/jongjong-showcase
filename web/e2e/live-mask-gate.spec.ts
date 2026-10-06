import { expect, test } from '@playwright/test';

/**
 * Invalid live mask gate — partial/headless masks must not replace lastGood.
 */
test.describe('live mask gate hold', () => {
  test('partial head-chop mask is rejected', async ({ page }) => {
    await page.addScriptTag({
      content: `
        const MASK_GATE_AREA_COLLAPSE = 0.55;
        const MASK_GATE_TOP_JUMP = 0.12;
        const MASK_GATE_BOTTOM_JUMP = 0.18;
        const MASK_GATE_MAX_HOLD_FRAMES = 5;
        function createMaskGateState() { return { lastGood: null, holdFrames: 0 }; }
        function shouldAcceptLiveMask(state, candidate) {
          if (!candidate || candidate.personPixels < 40 || candidate.areaRatio < 0.01) {
            state.holdFrames += 1;
            return { accept: false, reason: 'empty-or-tiny' };
          }
          const prev = state.lastGood;
          if (!prev) {
            state.lastGood = candidate;
            state.holdFrames = 0;
            return { accept: true, reason: 'first-good' };
          }
          const areaCollapse = candidate.areaRatio < prev.areaRatio * MASK_GATE_AREA_COLLAPSE;
          const topJump = candidate.minY - prev.minY > MASK_GATE_TOP_JUMP;
          const headChop = topJump && Math.abs(candidate.maxY - prev.maxY) < MASK_GATE_BOTTOM_JUMP;
          if (areaCollapse || headChop) {
            state.holdFrames += 1;
            return { accept: false, reason: areaCollapse ? 'area-collapse' : 'head-chop' };
          }
          state.lastGood = candidate;
          state.holdFrames = 0;
          return { accept: true, reason: 'ok' };
        }
        window.__gate = { createMaskGateState, shouldAcceptLiveMask };
      `,
    });

    const result = await page.evaluate(() => {
      const state = window.__gate.createMaskGateState();
      const good = { areaRatio: 0.22, minY: 0.08, maxY: 0.92, minX: 0.2, maxX: 0.8, personPixels: 2000 };
      const partial = { areaRatio: 0.14, minY: 0.35, maxY: 0.92, minX: 0.2, maxX: 0.8, personPixels: 1200 };
      const a = window.__gate.shouldAcceptLiveMask(state, good);
      const b = window.__gate.shouldAcceptLiveMask(state, partial);
      const c = window.__gate.shouldAcceptLiveMask(state, good);
      return { a, b, c, lastMinY: state.lastGood.minY };
    });

    expect(result.a.accept).toBe(true);
    expect(result.b.accept).toBe(false);
    expect(result.b.reason).toBe('head-chop');
    expect(result.c.accept).toBe(true);
    expect(result.lastMinY).toBe(0.08);
  });
});
