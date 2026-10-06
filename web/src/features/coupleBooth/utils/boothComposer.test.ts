import assert from 'node:assert/strict';
import test from 'node:test';
import { boothCropCssTransform } from './boothComposer';

test('preview crop has no offset until the image is zoomed', () => {
  assert.equal(boothCropCssTransform({ scale: 1, x: 1, y: -1 }), 'translate(0%, 0%) scale(1)');
});

test('preview crop uses the same normalized overflow range as canvas export', () => {
  assert.equal(boothCropCssTransform({ scale: 2, x: 0.5, y: -0.25 }), 'translate(-50%, 25%) scale(2)');
});
