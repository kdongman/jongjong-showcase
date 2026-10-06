import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('SameSpaceScenePreview resource lifecycle', () => {
  const source = readFileSync(join(here, 'SameSpaceScenePreview.tsx'), 'utf8');

  it('does not create object URLs during render or transform edits', () => {
    assert.doesNotMatch(source, /URL\.createObjectURL/);
    assert.doesNotMatch(source, /URL\.revokeObjectURL/);
  });

  it('caches bitmaps by URL and redraws transforms without reloading', () => {
    assert.match(source, /loadedRef/);
    assert.match(source, /assetsEpoch/);
    assert.match(source, /schedulePaint/);
    assert.match(source, /offscreen compose|Offscreen compose|document\.createElement\('canvas'\)/);
    // Transform props must not be in the image-load effect dependency alone via layers.
    assert.match(source, /Never recreate object URLs|never reload on transform|Load bitmaps once/i);
  });

  it('exposes corner resize handles and pointer capture for editor gestures', () => {
    assert.match(source, /mode: 'resize'/);
    assert.match(source, /setPointerCapture/);
    assert.match(source, /touchAction: 'none'/);
    assert.match(source, /HANDLE_CSS_PX/);
    assert.match(source, /mode: 'pinch'/);
  });
});

describe('Review live loop stop', () => {
  it('does not mount SameSpaceVideoStage during review status', () => {
    const page = readFileSync(join(here, '../pages/BoothSessionPage.tsx'), 'utf8');
    assert.match(page, /showLiveStage/);
    assert.match(page, /isMediaActiveStatus\(session\.status\)/);
    // Review card is separate from the live stage branch.
    assert.match(page, /session\.status === 'review'/);
  });
});
