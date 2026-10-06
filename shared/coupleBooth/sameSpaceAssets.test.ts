import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BoothShotRow } from './types';
import {
  applyAtomicSameSpaceCutoutFallback,
  assertDistinctParticipantAssets,
  canShowSameSpaceComposition,
  findParticipantShot,
  pathLogSuffix,
  resolveSameSpaceShotAssets,
} from './sameSpaceAssets';

function shot(partial: Partial<BoothShotRow> & Pick<BoothShotRow, 'id' | 'userId' | 'shotIndex' | 'captureId' | 'imagePath'>): BoothShotRow {
  return {
    sessionId: 'session',
    capturedAt: new Date().toISOString(),
    ...partial,
  };
}

describe('sameSpaceAssets mapping', () => {
  const host = shot({
    id: 'host-shot-1',
    userId: 'host-user',
    shotIndex: 1,
    captureId: 'capture-aaa',
    imagePath: 'c/s/host-user/shot-01-captureaaa.jpg',
    cutoutPath: 'c/s/host-user/cutout-01-captureaaa.png',
    segmentationStatus: 'ready',
  });
  const guest = shot({
    id: 'guest-shot-1',
    userId: 'guest-user',
    shotIndex: 1,
    captureId: 'capture-aaa',
    imagePath: 'c/s/guest-user/shot-01-captureaaa.jpg',
    cutoutPath: 'c/s/guest-user/cutout-01-captureaaa.png',
    segmentationStatus: 'ready',
  });

  it('maps host/guest by participant id, not array order', () => {
    const assets = resolveSameSpaceShotAssets([guest, host], 1, 'host-user', 'guest-user');
    assert.ok(assets);
    assert.equal(assets.hostShot.id, 'host-shot-1');
    assert.equal(assets.guestShot.id, 'guest-shot-1');
    assert.equal(assets.hostShot.userId !== assets.guestShot.userId, true);
    assert.equal(assets.hostShot.imagePath !== assets.guestShot.imagePath, true);
    assert.equal(assets.hostShot.shotIndex, assets.guestShot.shotIndex);
    assert.equal(assertDistinctParticipantAssets(assets), true);
  });

  it('rejects captureId mismatch and same participant paths', () => {
    const mismatched = shot({ ...guest, captureId: 'capture-bbb' });
    assert.equal(resolveSameSpaceShotAssets([host, mismatched], 1, 'host-user', 'guest-user'), null);
    assert.equal(findParticipantShot([host, guest], 1, 'guest-user')?.id, 'guest-shot-1');
  });

  it('keeps solo cutouts when only one participant uploaded', () => {
    const urls = applyAtomicSameSpaceCutoutFallback(
      {
        'host-shot-1': 'https://example/host.jpg',
        'host-shot-1:cutout': 'https://example/host-cutout.png',
      },
      [host],
      'host-user',
      'guest-user',
    );
    assert.equal(urls['host-shot-1:cutout'], 'https://example/host-cutout.png');
  });

  it('atomically strips one-sided cutout urls', () => {
    const urls = applyAtomicSameSpaceCutoutFallback(
      {
        'host-shot-1': 'https://example/host.jpg',
        'guest-shot-1': 'https://example/guest.jpg',
        'host-shot-1:cutout': 'https://example/host-cutout.png',
      },
      [host, guest],
      'host-user',
      'guest-user',
    );
    assert.equal(urls['host-shot-1'], 'https://example/host.jpg');
    assert.equal(urls['guest-shot-1'], 'https://example/guest.jpg');
    assert.equal(urls['host-shot-1:cutout'], undefined);
    assert.equal(urls['guest-shot-1:cutout'], undefined);
    assert.equal(
      canShowSameSpaceComposition({
        sameSpaceEnabled: true,
        hostCutoutUrl: urls['host-shot-1:cutout'],
        guestCutoutUrl: urls['guest-shot-1:cutout'],
        assets: resolveSameSpaceShotAssets([host, guest], 1, 'host-user', 'guest-user'),
      }),
      false,
    );
  });

  it('keeps both cutouts when the pair is complete', () => {
    const urls = applyAtomicSameSpaceCutoutFallback(
      {
        'host-shot-1:cutout': 'https://example/host-cutout.png',
        'guest-shot-1:cutout': 'https://example/guest-cutout.png',
      },
      [host, guest],
      'host-user',
      'guest-user',
    );
    assert.equal(
      canShowSameSpaceComposition({
        sameSpaceEnabled: true,
        hostCutoutUrl: urls['host-shot-1:cutout'],
        guestCutoutUrl: urls['guest-shot-1:cutout'],
        assets: resolveSameSpaceShotAssets([host, guest], 1, 'host-user', 'guest-user'),
      }),
      true,
    );
  });

  it('never logs a full path longer than the suffix window', () => {
    const suffix = pathLogSuffix('a'.repeat(80) + '/cutout.png', 48);
    assert.ok(suffix.length <= 48);
    assert.ok(suffix.endsWith('/cutout.png'));
  });
});
