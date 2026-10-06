import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { liveSegmenterAssetPaths } from './LivePersonSegmenter';

describe('liveSegmenterAssetPaths', () => {
  it('uses Vite BASE_URL mediapipe assets without localhost hardcoding', () => {
    const paths = liveSegmenterAssetPaths();
    assert.match(paths.model, /mediapipe\/selfie_segmenter_landscape\.tflite$/);
    assert.match(paths.wasm, /mediapipe\/wasm$/);
    assert.equal(paths.model.includes('localhost'), false);
    assert.equal(paths.wasm.includes('localhost'), false);
    assert.equal(paths.model.startsWith('http://'), false);
    assert.equal(paths.wasm.startsWith('http://'), false);
  });
});
