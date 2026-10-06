import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSameSpaceLayerDisplay, shouldPreferRawVideoFallback } from './SameSpaceVideoStage';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canDrawSameSpaceRawVideo,
  drawSameSpacePersonLayer,
} from '../composition/sameSpaceCanvasRenderer';

const here = dirname(fileURLToPath(import.meta.url));

type Call = { name: string; source?: unknown };

function fakeContext(calls: Call[] = []) {
  let composite = 'source-over';
  return {
    calls,
    get globalCompositeOperation() { return composite; },
    set globalCompositeOperation(value: string) { composite = value; calls.push({ name: `op:${value}` }); },
    save: () => calls.push({ name: 'save' }),
    restore: () => calls.push({ name: 'restore' }),
    clearRect: () => calls.push({ name: 'clear' }),
    fillRect: () => calls.push({ name: 'fillRect' }),
    beginPath: () => calls.push({ name: 'beginPath' }),
    ellipse: () => calls.push({ name: 'ellipse' }),
    fill: () => calls.push({ name: 'fill' }),
    fillText: () => calls.push({ name: 'fillText' }),
    drawImage: (source: unknown) => calls.push({ name: 'draw', source }),
    putImageData: () => calls.push({ name: 'put' }),
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
  };
}

describe('Same Space production display policy (no raw rectangles)', () => {
  it('never prefers raw video in production (allowDebugRawVideo false)', () => {
    assert.equal(
      resolveSameSpaceLayerDisplay({
        hasCommittedForeground: true,
        foregroundFresh: false,
        reconnecting: true,
        rawUsable: true,
        allowDebugRawVideo: false,
        hasRemoteExpectation: true,
      }).preferRawVideo,
      false,
    );
    assert.equal(
      shouldPreferRawVideoFallback({
        hasCommittedForeground: true,
        foregroundFresh: false,
        rawUsable: true,
        allowDebugRawVideo: false,
      }),
      false,
    );
  });

  it('shows loading silhouette before first cutout instead of raw video', () => {
    const display = resolveSameSpaceLayerDisplay({
      hasCommittedForeground: false,
      foregroundFresh: false,
      reconnecting: false,
      rawUsable: true,
      allowDebugRawVideo: false,
      hasRemoteExpectation: true,
    });
    assert.equal(display.preferRawVideo, false);
    assert.equal(display.showLoadingSilhouette, true);
    assert.equal(display.showReconnecting, false);
  });

  it('keeps last cutout on soft stale and shows reconnecting when long stale', () => {
    const soft = resolveSameSpaceLayerDisplay({
      hasCommittedForeground: true,
      foregroundFresh: false,
      reconnecting: false,
      rawUsable: true,
      allowDebugRawVideo: false,
      hasRemoteExpectation: true,
    });
    assert.equal(soft.preferRawVideo, false);
    assert.equal(soft.showReconnecting, false);

    const long = resolveSameSpaceLayerDisplay({
      hasCommittedForeground: true,
      foregroundFresh: false,
      reconnecting: true,
      rawUsable: true,
      allowDebugRawVideo: false,
      hasRemoteExpectation: true,
    });
    assert.equal(long.preferRawVideo, false);
    assert.equal(long.showReconnecting, true);
  });

  it('allows raw only when DEV debug gate is explicit', () => {
    assert.equal(
      resolveSameSpaceLayerDisplay({
        hasCommittedForeground: true,
        foregroundFresh: false,
        reconnecting: true,
        rawUsable: true,
        allowDebugRawVideo: true,
        hasRemoteExpectation: true,
      }).preferRawVideo,
      true,
    );
  });

  it('canDrawSameSpaceRawVideo requires allowDebugRawVideo', () => {
    const rawVideo = { videoWidth: 20, videoHeight: 20 } as HTMLVideoElement;
    assert.equal(
      canDrawSameSpaceRawVideo({
        allowDebugRawVideo: false,
        preferRawVideo: true,
        rawVideo,
      }),
      false,
    );
    assert.equal(
      canDrawSameSpaceRawVideo({
        allowDebugRawVideo: true,
        preferRawVideo: true,
        rawVideo,
      }),
      true,
    );
  });

  it('production draw path never uses raw video even if preferRawVideo is set', () => {
    const rawVideo = { videoWidth: 40, videoHeight: 40 } as HTMLVideoElement;
    const calls: Call[] = [];
    drawSameSpacePersonLayer(fakeContext(calls) as unknown as CanvasRenderingContext2D, 100, 100, {
      slot: 'right',
      output: null,
      bounds: null,
      sourceWidth: 40,
      sourceHeight: 40,
      mirrorDisplay: false,
      rawVideo,
      preferRawVideo: true,
      allowDebugRawVideo: false,
      showLoadingSilhouette: true,
    });
    const draws = calls.filter((call) => call.name === 'draw');
    assert.equal(draws.length, 0);
    assert.ok(calls.some((call) => call.name === 'ellipse' || call.name === 'fill'));
  });

  it('stage source never enables production raw fallback without DEV debug gate', () => {
    const source = readFileSync(join(here, 'SameSpaceVideoStage.tsx'), 'utf8');
    assert.match(source, /allowDebugRawVideo/);
    assert.match(source, /resolveSameSpaceLayerDisplay/);
    assert.match(source, /import\.meta\.env\.DEV/);
    assert.match(source, /showLoadingSilhouette/);
    assert.match(source, /showReconnecting/);
  });
});
