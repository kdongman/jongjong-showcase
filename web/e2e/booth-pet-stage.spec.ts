import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shotDir = path.join(here, 'screenshots');

test('canonical pets ground correctly across all shared scenes', async ({ page }) => {
  fs.mkdirSync(shotDir, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('http://127.0.0.1:4173');
  const result = await page.evaluate(async () => {
    const renderer = await import('/src/features/coupleBooth/composition/sameSpaceCanvasRenderer.ts');
    const pets = await import('/src/features/coupleBooth/composition/boothCompanionCanvas.ts');
    document.body.innerHTML = '<main id="grid"></main>';
    document.body.style.margin = '0'; document.body.style.background = '#17131f';
    const grid = document.querySelector('#grid') as HTMLElement;
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px';
    const scenes = ['classic', 'photo-studio', 'cozy-room', 'night-booth'];
    const companions = [
      { id:'dog', type:'dog', displayName:'Dog', expression:'idle', renderAsset:{ id:'dog', uri:'/pets/poses/dog_sit_bottom_left.svg' }, transform:{ x:.2,y:.94,scale:.17,rotation:0,flipX:false }, zIndex:0 },
      { id:'tiger', type:'tiger', displayName:'Tiger', expression:'idle', renderAsset:{ id:'tiger', uri:'/pets/tiger.png' }, transform:{ x:.8,y:.94,scale:.17,rotation:0,flipX:true }, zIndex:1 },
    ];
    await pets.preloadBoothCompanions(companions);
    for (const scene of scenes) for (const set of [companions.slice(0, 1), companions]) {
      const card = document.createElement('section');
      card.style.cssText = 'background:#fff;padding:8px;border-radius:12px;color:#332e3d;font:600 14px sans-serif';
      card.textContent = `${scene} · ${set.length} pet${set.length > 1 ? 's' : ''}`;
      const canvas = document.createElement('canvas'); canvas.width=1200; canvas.height=900; canvas.style.cssText='display:block;width:100%;margin-top:6px;border-radius:8px';
      const ctx = canvas.getContext('2d')!;
      renderer.renderBoothSharedSceneBackground(ctx,1200,900,scene);
      ctx.fillStyle='rgba(83,66,112,.72)'; ctx.beginPath(); ctx.ellipse(470,510,180,330,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(132,104,155,.72)'; ctx.beginPath(); ctx.ellipse(730,510,180,330,0,0,Math.PI*2); ctx.fill();
      pets.drawBoothCompanions(ctx,1200,900,set);
      renderer.renderBoothSharedSceneForeground(ctx,1200,900,scene);
      card.append(canvas); grid.append(card);
    }
    return { canvases: document.querySelectorAll('canvas').length, images: companions.length };
  });
  expect(result).toEqual({ canvases: 8, images: 2 });
  await page.locator('#grid').screenshot({ path: path.join(shotDir, 'booth-pets-all-scenes.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#grid').evaluate((element) => { (element as HTMLElement).style.gridTemplateColumns = '1fr'; });
  await page.locator('#grid').screenshot({ path: path.join(shotDir, 'booth-pets-all-scenes-mobile.png'), animations: 'disabled' });
});
