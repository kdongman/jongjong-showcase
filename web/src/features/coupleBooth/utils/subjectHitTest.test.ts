import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectSubjectHitsAtPoint,
  pointInRect,
  resolveOverlappingSubjectHit,
  sampleDestAlpha,
} from './subjectHitTest';

function makeImageData(width: number, height: number): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  } as ImageData;
}

describe('subjectHitTest', () => {
  it('detects point in rect', () => {
    assert.equal(pointInRect(10, 10, { x: 0, y: 0, width: 20, height: 20 }), true);
    assert.equal(pointInRect(25, 10, { x: 0, y: 0, width: 20, height: 20 }), false);
  });

  it('prefers selected subject when overlapping', () => {
    const slot = resolveOverlappingSubjectHit({
      candidates: [
        { slot: 'left', rect: { x: 0, y: 0, width: 100, height: 100 }, alphaHit: true },
        { slot: 'right', rect: { x: 40, y: 0, width: 100, height: 100 }, alphaHit: true },
      ],
      drawOrder: ['left', 'right'],
      selectedSlot: 'left',
    });
    assert.equal(slot, 'left');
  });

  it('picks topmost when nothing selected', () => {
    const slot = resolveOverlappingSubjectHit({
      candidates: [
        { slot: 'left', rect: { x: 0, y: 0, width: 100, height: 100 }, alphaHit: true },
        { slot: 'right', rect: { x: 40, y: 0, width: 100, height: 100 }, alphaHit: true },
      ],
      drawOrder: ['left', 'right'],
      selectedSlot: null,
    });
    assert.equal(slot, 'right');
  });

  it('cycles away from preferCycleFrom on overlap', () => {
    const slot = resolveOverlappingSubjectHit({
      candidates: [
        { slot: 'left', rect: { x: 0, y: 0, width: 100, height: 100 }, alphaHit: true },
        { slot: 'right', rect: { x: 40, y: 0, width: 100, height: 100 }, alphaHit: true },
      ],
      drawOrder: ['left', 'right'],
      selectedSlot: 'right',
      preferCycleFrom: 'right',
    });
    assert.equal(slot, 'left');
  });

  it('ignores transparent bbox regions in collectSubjectHitsAtPoint', () => {
    const data = makeImageData(2, 2);
    // Only top-left opaque
    data.data[3] = 255;
    const hits = collectSubjectHitsAtPoint({
      point: { x: 75, y: 25 },
      slots: ['left', 'right'],
      getPersonDest: (slot) => (slot === 'left'
        ? { x: 0, y: 0, width: 100, height: 100 }
        : { x: 50, y: 0, width: 100, height: 100 }),
      getDest: (slot) => (slot === 'left'
        ? { x: 0, y: 0, width: 100, height: 100 }
        : { x: 50, y: 0, width: 100, height: 100 }),
      getAlphaData: (slot) => (slot === 'left' ? data : null),
    });
    // left sample at (75,25) → transparent; right unknown alpha → hit
    assert.equal(hits.find((h) => h.slot === 'left')?.alphaHit, false);
    assert.equal(hits.find((h) => h.slot === 'right')?.alphaHit, true);
  });

  it('sampleDestAlpha returns 0 outside dest', () => {
    const data = makeImageData(2, 2);
    data.data[3] = 255;
    assert.equal(sampleDestAlpha(data, { x: 0, y: 0, width: 10, height: 10 }, 20, 20), 0);
  });
});
