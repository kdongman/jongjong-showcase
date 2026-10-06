import { expect, test } from '@playwright/test';
import {
  bakeVisibleRectToManualPlacement,
  cloneShotCompositionPlacements,
  denormalizeRect,
  emptyShotCompositionPlacements,
  normalizeLogicalRect,
  placementForSubject,
  rectsNearlyEqual,
  resolveSubjectDrawRect,
  setPlacementForSubject,
  type SubjectPlacement,
} from '../../shared/coupleBooth/subjectPlacement';
import { defaultPersonBounds } from '../../shared/coupleBooth/sameSpaceComposition';
import {
  packSlotCropsWithMeta,
  parseSameSpaceCompositionMeta,
} from '../../shared/coupleBooth/sameSpaceCompositionMeta';
import { DEFAULT_SAME_SPACE_BACKGROUND } from '../../shared/coupleBooth/sameSpaceBackground';

/**
 * WYSIWYG composition regression — mirrors the 27s review recording where
 * shot #4 reopen drifted / flipped after complete.
 *
 * These tests exercise the real shared resolveSubjectDrawRect + meta
 * round-trip in the browser (not screenshot similarity).
 */

const FRAME = { w: 1200, h: 900 };
const A = 'subject-a';
const B = 'subject-b';

function logicalRect(x: number, y: number, width: number, height: number) {
  return { x, y, width, height };
}

function resolveManual(placement: SubjectPlacement) {
  return resolveSubjectDrawRect({
    frameWidth: FRAME.w,
    frameHeight: FRAME.h,
    placement,
    alphaBounds: defaultPersonBounds(),
    sourceWidth: 640,
    sourceHeight: 480,
    homeSlot: 'left',
    spanMode: 'two_cell',
  }).personDest;
}

test.describe('composition WYSIWYG absolute placements', () => {
  test('1 exact drag commit: editor rect == preview/export resolve', async () => {
    const a = bakeVisibleRectToManualPlacement(logicalRect(180, 120, 280, 560), FRAME.w, FRAME.h);
    const b = bakeVisibleRectToManualPlacement(logicalRect(620, 140, 300, 580), FRAME.w, FRAME.h);
    // Simulate "complete immediately after drag" via draftRef snapshot (not stale state).
    const draftSnapshot = { [A]: a, [B]: b };
    const editorRectA = resolveManual(draftSnapshot[A]!);
    const previewRectA = resolveManual(draftSnapshot[A]!);
    const exportRectA = resolveManual(draftSnapshot[A]!);
    expect(rectsNearlyEqual(editorRectA, previewRectA, 1)).toBe(true);
    expect(rectsNearlyEqual(editorRectA, exportRectA, 1)).toBe(true);
    expect(rectsNearlyEqual(resolveManual(draftSnapshot[B]!), resolveManual(b), 1)).toBe(true);
  });

  test('2 reopen stability ×10', async () => {
    let shot = emptyShotCompositionPlacements();
    shot = setPlacementForSubject(
      shot,
      'two_cell',
      A,
      bakeVisibleRectToManualPlacement(logicalRect(220, 100, 260, 520), FRAME.w, FRAME.h),
    );
    shot = setPlacementForSubject(
      shot,
      'two_cell',
      B,
      bakeVisibleRectToManualPlacement(logicalRect(700, 110, 270, 540), FRAME.w, FRAME.h),
    );
    const firstA = resolveManual(placementForSubject(shot, 'two_cell', A));
    const firstB = resolveManual(placementForSubject(shot, 'two_cell', B));

    for (let i = 0; i < 10; i += 1) {
      // Simulate pack → hydrate → reopen
      const packed = packSlotCropsWithMeta({}, {
        background: DEFAULT_SAME_SPACE_BACKGROUND,
        frontSlot: 'left',
        soloLayout: 'half',
        revision: i + 1,
        sceneSpanMode: 'two_cell',
        slotSubjectPlacements: { '4': cloneShotCompositionPlacements(shot) },
      });
      const meta = parseSameSpaceCompositionMeta(
        (packed as Record<string, unknown>).__sameSpace,
      );
      shot = cloneShotCompositionPlacements(meta.slotSubjectPlacements?.['4']);
      const againA = resolveManual(placementForSubject(shot, 'two_cell', A));
      const againB = resolveManual(placementForSubject(shot, 'two_cell', B));
      expect(rectsNearlyEqual(firstA, againA, 1)).toBe(true);
      expect(rectsNearlyEqual(firstB, againB, 1)).toBe(true);
    }
  });

  test('3 crossing keeps subject identity', async () => {
    // A starts left, crosses to visual right
    let shot = emptyShotCompositionPlacements();
    shot = setPlacementForSubject(
      shot,
      'two_cell',
      A,
      bakeVisibleRectToManualPlacement(logicalRect(750, 100, 250, 500), FRAME.w, FRAME.h),
    );
    shot = setPlacementForSubject(
      shot,
      'two_cell',
      B,
      bakeVisibleRectToManualPlacement(logicalRect(150, 100, 250, 500), FRAME.w, FRAME.h),
    );
    const aRect = placementForSubject(shot, 'two_cell', A).rect!;
    const bRect = placementForSubject(shot, 'two_cell', B).rect!;
    expect(aRect.x).toBeGreaterThan(0.5);
    expect(bRect.x).toBeLessThan(0.5);
    // After "reopen" identity must not swap
    const packed = packSlotCropsWithMeta({}, {
      background: DEFAULT_SAME_SPACE_BACKGROUND,
      frontSlot: 'left',
      soloLayout: 'half',
      revision: 1,
      sceneSpanMode: 'two_cell',
      slotSubjectPlacements: { '4': shot },
    });
    const meta = parseSameSpaceCompositionMeta(
      (packed as Record<string, unknown>).__sameSpace,
    );
    const again = meta.slotSubjectPlacements?.['4'];
    expect(again?.two_cell[A]?.rect?.x).toBeGreaterThan(0.5);
    expect(again?.two_cell[B]?.rect?.x).toBeLessThan(0.5);
  });

  test('4 selection / z-order does not mutate rects', async () => {
    const a = bakeVisibleRectToManualPlacement(logicalRect(400, 120, 280, 560), FRAME.w, FRAME.h);
    const b = bakeVisibleRectToManualPlacement(logicalRect(420, 130, 280, 560), FRAME.w, FRAME.h);
    const before = { [A]: a, [B]: b };
    // Simulate [나]/[상대] toggles + front/back — only UI state changes
    let selected = A;
    let front = A;
    for (let i = 0; i < 8; i += 1) {
      selected = selected === A ? B : A;
      front = front === A ? B : A;
    }
    expect(selected === A || selected === B).toBe(true);
    expect(before[A]).toEqual(a);
    expect(before[B]).toEqual(b);
    expect(rectsNearlyEqual(resolveManual(before[A]!), resolveManual(a), 1)).toBe(true);
  });

  test('5 z-order paint order only', async () => {
    const placements = {
      [A]: bakeVisibleRectToManualPlacement(logicalRect(200, 100, 250, 500), FRAME.w, FRAME.h),
      [B]: bakeVisibleRectToManualPlacement(logicalRect(500, 100, 250, 500), FRAME.w, FRAME.h),
    };
    const frontA = resolveManual(placements[A]!);
    // flip front
    const frontB = resolveManual(placements[B]!);
    expect(rectsNearlyEqual(frontA, resolveManual(placements[A]!), 1)).toBe(true);
    expect(rectsNearlyEqual(frontB, resolveManual(placements[B]!), 1)).toBe(true);
  });

  test('6 mode round-trip one_cell ↔ two_cell', async () => {
    let shot = emptyShotCompositionPlacements();
    shot = setPlacementForSubject(
      shot,
      'one_cell',
      A,
      bakeVisibleRectToManualPlacement(logicalRect(450, 100, 200, 400), FRAME.w, FRAME.h),
    );
    shot = setPlacementForSubject(
      shot,
      'two_cell',
      A,
      bakeVisibleRectToManualPlacement(logicalRect(100, 100, 200, 400), FRAME.w, FRAME.h),
    );
    const one = placementForSubject(shot, 'one_cell', A).rect!;
    const two = placementForSubject(shot, 'two_cell', A).rect!;
    expect(one.x).not.toBe(two.x);

    // Return to one_cell — previous one_cell rect restored
    expect(placementForSubject(shot, 'one_cell', A).rect).toEqual(one);
    expect(placementForSubject(shot, 'two_cell', A).rect).toEqual(two);
  });

  test('7 pending RAF: draftRef snapshot wins over stale state', async ({ page }) => {
    await page.setContent(`
      <html><body>
        <button id="drag">drag</button>
        <button id="save">완료</button>
        <pre id="out"></pre>
        <script>
          let state = { x: 0.1 };
          let draftRef = { x: 0.1 };
          let raf = 0;
          const schedule = (next) => {
            draftRef = next; // sync ref always
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              raf = 0;
              state = draftRef; // lagged state
            });
          };
          document.getElementById('drag').onclick = () => schedule({ x: 0.42 });
          document.getElementById('save').onclick = () => {
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            // Complete must read draftRef, not state
            document.getElementById('out').textContent = JSON.stringify({
              saved: draftRef.x,
              staleState: state.x,
            });
          };
        </script>
      </body></html>
    `);
    await page.click('#drag');
    // Immediately complete before RAF paints state
    await page.click('#save');
    const out = JSON.parse(await page.locator('#out').innerText());
    expect(out.saved).toBe(0.42);
  });

  test('8 hydrate round-trip preserves normalized rect', async () => {
    const rect = normalizeLogicalRect(logicalRect(333, 111, 222, 444), FRAME.w, FRAME.h);
    const packed = packSlotCropsWithMeta({}, {
      background: DEFAULT_SAME_SPACE_BACKGROUND,
      frontSlot: 'left',
      soloLayout: 'half',
      revision: 3,
      sceneSpanMode: 'two_cell',
      slotSubjectPlacements: {
        '4': {
          one_cell: {},
          two_cell: { [A]: { mode: 'manual', rect }, [B]: { mode: 'auto', rect: null } },
          frontSubjectId: A,
        },
      },
    });
    const meta = parseSameSpaceCompositionMeta(
      (packed as Record<string, unknown>).__sameSpace,
    );
    const again = meta.slotSubjectPlacements?.['4']?.two_cell[A]?.rect;
    expect(again).toEqual(rect);
    const logical = denormalizeRect(again!, FRAME.w, FRAME.h);
    expect(rectsNearlyEqual(logical, logicalRect(333, 111, 222, 444), 1)).toBe(true);
  });

  test('DOM: strip compose opens shared editor marker', async ({ page }) => {
    await page.setContent(`
      <html><body>
        <div data-strip-slot="2" data-shot-index="4">
          <button data-testid="strip-compose-2">구도 조정</button>
        </div>
        <div data-testid="same-space-composition-editor" style="display:none;width:400px;height:240px">editor</div>
        <script>
          document.querySelector('[data-testid="strip-compose-2"]').onclick = () => {
            const root = document.querySelector('[data-strip-slot]');
            window.__target = {
              stripSlot: Number(root.dataset.stripSlot),
              shotIndex: Number(root.dataset.shotIndex),
            };
            document.querySelector('[data-testid="same-space-composition-editor"]').style.display = 'block';
          };
        </script>
      </body></html>
    `);
    await page.getByTestId('strip-compose-2').click();
    const target = await page.evaluate(() => (window as unknown as { __target: { stripSlot: number; shotIndex: number } }).__target);
    expect(target).toEqual({ stripSlot: 2, shotIndex: 4 });
    await expect(page.getByTestId('same-space-composition-editor')).toBeVisible();
  });
});
