import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../../../index.css'), 'utf8');
const page = readFileSync(join(here, '../pages/BoothSessionPage.tsx'), 'utf8');

test('mobile normal split keeps horizontal 50:50 columns', () => {
  assert.match(
    css,
    /@media \(max-width: 720px\)[\s\S]*\.booth-stage-canvas \.booth-shared-stage\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/,
  );
  assert.doesNotMatch(
    css,
    /@media \(max-width: 720px\)[\s\S]*\.video-stage,\s*\n\s*\.booth-shared-stage\s*\{\s*\n\s*grid-template-columns:\s*1fr/,
  );
});

test('mobile bottom controls reserve Safari safe-area space', () => {
  assert.match(css, /booth-stage-shell\.is-live[\s\S]{0,180}safe-area-inset-bottom/);
  assert.match(css, /\.booth-stage-controls\s*\{[\s\S]{0,120}safe-area-inset-bottom/);
});

test('booth header exposes Home beside Settings and keeps mobile layout compact', () => {
  assert.match(page, /booth-stage-header-actions/);
  assert.match(page, /booth-stage-home-button/);
  assert.match(page, /onClick=\{onHome\}/);
  assert.doesNotMatch(page, /<BoothStageMenu[\s\S]*onLeave=\{\(\) => void onLeave\(\)\}/);
  assert.match(css, /\.booth-stage-header-actions\s*\{[\s\S]*gap:\s*8px/);
  assert.match(css, /\.booth-stage-home-button\s*\{[\s\S]*min-height:\s*40px/);
});

test('home navigation confirms only while capture, finalizing, or review can lose work', () => {
  assert.match(page, /session\?\.status === 'capturing'/);
  assert.match(page, /session\?\.status === 'finalizing'/);
  assert.match(page, /session\?\.status === 'review'/);
  assert.match(page, /onLeave\(confirmExit\)/);
  assert.match(page, /navigate\('\/booth', \{ replace: true \}\)/);
});

test('camera stage auto-start does not schedule the first shot', () => {
  const clockFn = page.match(/const onStartCaptureClock = async \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  const shotFn = page.match(/const onScheduleShot = async \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
  assert.match(page, /planCaptureAutoStart/);
  assert.match(clockFn, /startBoothCapture/);
  assert.doesNotMatch(clockFn, /scheduleBoothShot/);
  assert.match(shotFn, /scheduleBoothShot/);
  assert.doesNotMatch(shotFn, /startBoothCapture/);
  assert.doesNotMatch(page, /startCaptureClockRef/);
  assert.match(page, /capturePhase === 'PREVIEW'/);
  assert.match(page, /booth-stage-preview-actions/);
  assert.match(page, /onClick=\{\(\) => void onStartCaptureClock\(\)\}/);
});

test('Same Space remains an interactive preview/capture mode with peer sync', () => {
  assert.match(page, /type: 'same_space_mode_preview'/);
  assert.match(page, /checked=\{sameSpaceEnabled\}/);
  assert.match(page, /setLiveSameSpaceMode/);
  assert.match(page, /sameSpaceModeLocked = Boolean\(/);
  assert.match(page, /sameSpaceEnabled,\s*\n\s*captureViewportMode/);
});

test('capture viewport mode is host-selected, shared, and locked after capture starts', () => {
  assert.match(page, /type: 'capture_viewport_mode'/);
  assert.match(page, /broadcastCaptureViewportMode\('desktop'\)/);
  assert.match(page, /broadcastCaptureViewportMode\('mobile'\)/);
  assert.match(page, /captureViewportModeLocked/);
  assert.match(page, /captureViewportMode\}/);
  assert.match(css, /booth-capture-viewport-control/);
  assert.match(css, /data-capture-viewport='mobile'/);
});
