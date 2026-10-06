import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decontaminateForegroundEdge } from './foregroundEdgeCleanup';

const here = dirname(fileURLToPath(import.meta.url));

function makeImageData(width: number, height: number): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  } as ImageData;
}

describe('foregroundEdgeCleanup', () => {
  it('pulls bright semi-transparent fringe toward opaque neighbour color', () => {
    const width = 3;
    const height = 1;
    const rgb = makeImageData(width, height);
    rgb.data[0] = 180;
    rgb.data[1] = 120;
    rgb.data[2] = 100;
    rgb.data[3] = 255;
    rgb.data[4] = 250;
    rgb.data[5] = 250;
    rgb.data[6] = 250;
    rgb.data[7] = 255;
    rgb.data[8] = 0;
    rgb.data[9] = 0;
    rgb.data[10] = 0;
    rgb.data[11] = 255;

    const alpha = new Uint8ClampedArray([255, 90, 0]);
    decontaminateForegroundEdge(rgb, alpha);
    assert.ok(rgb.data[4]! < 250);
    assert.ok(rgb.data[5]! < 250);
  });
});

describe('sameSpace shadow regression', () => {
  it('does not render per-person ellipse ground shadows', () => {
    const renderer = readFileSync(join(here, '../composition/sameSpaceCanvasRenderer.ts'), 'utf8');
    assert.doesNotMatch(renderer, /drawSharedFootShadow/);
    assert.match(renderer, /No per-person ground ellipse/);
  });
});
