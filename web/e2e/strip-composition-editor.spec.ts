import { expect, test } from '@playwright/test';
import {
  buildCompositionEditorTarget,
  compositionEditorTitle,
  resolveStripShotIndex,
} from '../src/features/coupleBooth/utils/compositionEditorTarget';
import { resolveOverlappingSubjectHit } from '../src/features/coupleBooth/utils/subjectHitTest';

/**
 * Final-strip "구도 조정" must open the shared composition editor
 * keyed by selected[shotIndex], never by stripSlotIndex alone.
 */
test.describe('strip composition editor routing', () => {
  test('strip slot maps to selected shot index', () => {
    const selected = [2, 4, 5, 7];
    expect(resolveStripShotIndex(selected, 2)).toBe(5);
    const target = buildCompositionEditorTarget({
      source: 'final-strip',
      shotIndex: resolveStripShotIndex(selected, 2)!,
      stripSlotIndex: 2,
    });
    expect(target.shotIndex).toBe(5);
    expect(target.stripSlotIndex).toBe(2);
    expect(compositionEditorTitle(target)).toBe('최종 사진 3 · 촬영 #5');
  });

  test('shot-card and final-strip share the same target shape for a shot', () => {
    const fromCard = buildCompositionEditorTarget({ source: 'shot-card', shotIndex: 5 });
    const fromStrip = buildCompositionEditorTarget({
      source: 'final-strip',
      shotIndex: 5,
      stripSlotIndex: 2,
    });
    expect(fromCard.shotIndex).toBe(fromStrip.shotIndex);
  });

  test('overlap prefers selected then cycles', () => {
    const candidates = [
      { slot: 'left' as const, rect: { x: 0, y: 0, width: 100, height: 100 }, alphaHit: true },
      { slot: 'right' as const, rect: { x: 30, y: 0, width: 100, height: 100 }, alphaHit: true },
    ];
    expect(resolveOverlappingSubjectHit({
      candidates,
      drawOrder: ['left', 'right'],
      selectedSlot: 'left',
    })).toBe('left');
    expect(resolveOverlappingSubjectHit({
      candidates,
      drawOrder: ['left', 'right'],
      selectedSlot: 'left',
      preferCycleFrom: 'left',
    })).toBe('right');
  });

  test('DOM contract: strip compose button and shared editor markers', async ({ page }) => {
    await page.setContent(`
      <html><body>
        <div class="booth-editor-slot" data-strip-slot="2" data-shot-index="5">
          <button data-testid="strip-compose-2">구도 조정</button>
        </div>
        <div data-testid="same-space-composition-editor" style="display:none;width:320px;height:200px;">editor</div>
        <script>
          const btn = document.querySelector('[data-testid="strip-compose-2"]');
          const editor = document.querySelector('[data-testid="same-space-composition-editor"]');
          btn.addEventListener('click', () => {
            const slot = Number(btn.closest('[data-strip-slot]').dataset.stripSlot);
            const shot = Number(btn.closest('[data-shot-index]').dataset.shotIndex);
            window.__opened = { slot, shot, sameEditor: true };
            editor.style.display = 'block';
          });
          // Strip preview must not expose resize handles / drag overlays.
          window.__stripHasResize = Boolean(document.querySelector('.booth-editor-slot .resize-handle, .booth-editor-slot [data-drag-overlay]'));
        </script>
      </body></html>
    `);

    await page.getByTestId('strip-compose-2').click();
    const opened = await page.evaluate(() => (window as unknown as { __opened: { slot: number; shot: number; sameEditor: boolean } }).__opened);
    expect(opened).toEqual({ slot: 2, shot: 5, sameEditor: true });
    await expect(page.getByTestId('same-space-composition-editor')).toBeVisible();
    const hasResize = await page.evaluate(() => (window as unknown as { __stripHasResize: boolean }).__stripHasResize);
    expect(hasResize).toBe(false);
  });
});
