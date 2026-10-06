import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SAME_SPACE_BACKGROUND_KEY,
  SAME_SPACE_BACKGROUND_KEYS,
  isSameSpaceBackgroundKey,
  renderSameSpaceBackgroundPreset,
  resolveSameSpaceBackgroundPreset,
} from './sameSpaceBackgroundPresets';
import {
  DEFAULT_SAME_SPACE_BACKGROUND,
  isOurRoomBackground,
  ourRoomFrontPlatePath,
  ourRoomIncludesPets,
  parseSameSpaceBackground,
  sameSpaceBackgroundFromKey,
} from './sameSpaceBackground';
import {
  BOOTH_COLOR_MODE_FILTER,
  isBoothColorMode,
  parseBoothColorMode,
} from './boothColorMode';

describe('sameSpaceBackgroundPresets', () => {
  it('whitelists exactly the twelve MVP keys', () => {
    assert.equal(SAME_SPACE_BACKGROUND_KEYS.length, 12);
    assert.equal(isSameSpaceBackgroundKey('studio_cream'), true);
    assert.equal(isSameSpaceBackgroundKey('life4cut'), false);
    assert.equal(resolveSameSpaceBackgroundPreset('nope').key, DEFAULT_SAME_SPACE_BACKGROUND_KEY);
  });

  it('parses preset backgrounds and falls back safely', () => {
    assert.deepEqual(parseSameSpaceBackground({ type: 'preset', key: 'booth_pink' }), {
      type: 'preset',
      key: 'booth_pink',
    });
    assert.equal(parseSameSpaceBackground({ type: 'preset', key: 'hacked' }).type, 'preset');
    assert.equal(
      (parseSameSpaceBackground({ type: 'preset', key: 'hacked' }) as { key: string }).key,
      DEFAULT_SAME_SPACE_BACKGROUND_KEY,
    );
    assert.deepEqual(DEFAULT_SAME_SPACE_BACKGROUND, sameSpaceBackgroundFromKey('studio_cream'));
  });
});

describe('Our Room plate identity', () => {
  const room = {
    type: 'image' as const,
    presetId: 'our-room-v1-pets-on',
    storagePath: '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/backgrounds/our-room-1-back.png',
  };

  it('derives the front plate while keeping runtime signed URLs out of parsed state', () => {
    assert.equal(isOurRoomBackground(room), true);
    assert.equal(ourRoomIncludesPets(room), true);
    assert.equal(ourRoomFrontPlatePath(room)?.endsWith('our-room-1-front.png'), true);
    const parsed = parseSameSpaceBackground({ ...room, url: 'signed', frontUrl: 'signed-front' });
    assert.equal(parsed.type === 'image' ? parsed.frontUrl : undefined, undefined);
  });
});

describe('boothColorMode', () => {
  it('accepts only color/monochrome and shares one filter spec', () => {
    assert.equal(isBoothColorMode('monochrome'), true);
    assert.equal(isBoothColorMode('grayscale'), false);
    assert.equal(parseBoothColorMode('nope'), 'color');
    assert.match(BOOTH_COLOR_MODE_FILTER.monochrome, /grayscale\(1\)/);
    assert.match(BOOTH_COLOR_MODE_FILTER.monochrome, /contrast\(1\.06\)/);
  });
});

describe('procedural preset paint', () => {
  it('fills a mock canvas context for every key', () => {
    const calls: string[] = [];
    const ctx = {
      fillStyle: '',
      globalAlpha: 1,
      createLinearGradient: () => ({ addColorStop: () => undefined }),
      createRadialGradient: () => ({ addColorStop: () => undefined }),
      fillRect: (...args: unknown[]) => { calls.push(`rect:${args.join(',')}`); },
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => { calls.push('fill'); },
      save: () => undefined,
      restore: () => undefined,
    } as unknown as CanvasRenderingContext2D;

    for (const key of SAME_SPACE_BACKGROUND_KEYS) {
      calls.length = 0;
      renderSameSpaceBackgroundPreset(ctx, 320, 240, key);
      assert.ok(calls.some((c) => c.startsWith('rect:')), `expected paint for ${key}`);
    }
  });
});
