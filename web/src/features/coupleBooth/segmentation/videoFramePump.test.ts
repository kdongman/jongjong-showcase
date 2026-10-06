import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideVideoFrameAccept, shouldEngageRafFallback, VIDEO_FRAME_PUMP_RVFC_WATCHDOG_MS } from './videoFramePump';
import { formatDebugMediaTime, isSameSpaceDebugEnabled, shortId } from './sameSpacePipelineDebug';

describe('videoFramePump decideVideoFrameAccept', () => {
  it('rejects unusable video without permanently stopping the caller chain', () => {
    const decision = decideVideoFrameAccept({
      usable: false,
      lastMediaTime: Number.NaN,
      lastPresentedFrames: -1,
      mediaTime: 0,
      presentedFrames: 1,
      rvfcDelivery: true,
      rafTick: false,
    });
    assert.equal(decision.accept, false);
    assert.equal(decision.reason, 'unusable');
  });

  it('accepts advancing presentedFrames even when mediaTime stays at 0', () => {
    const first = decideVideoFrameAccept({
      usable: true,
      lastMediaTime: Number.NaN,
      lastPresentedFrames: -1,
      mediaTime: 0,
      presentedFrames: 0,
      rvfcDelivery: true,
      rafTick: false,
    });
    assert.equal(first.accept, true);

    const second = decideVideoFrameAccept({
      usable: true,
      lastMediaTime: first.mediaTime,
      lastPresentedFrames: first.presentedFrames,
      mediaTime: 0,
      presentedFrames: 1,
      rvfcDelivery: true,
      rafTick: false,
    });
    assert.equal(second.accept, true);
  });

  it('does not permanently starve LiveKit streams whose currentTime/mediaTime stay at 0', () => {
    let lastMediaTime = Number.NaN;
    let lastPresentedFrames = -1;
    const accepted: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const decision = decideVideoFrameAccept({
        usable: true,
        lastMediaTime,
        lastPresentedFrames,
        mediaTime: 0,
        presentedFrames: undefined,
        rvfcDelivery: true,
        rafTick: false,
      });
      if (!decision.accept) break;
      accepted.push(i);
      lastMediaTime = decision.mediaTime;
      lastPresentedFrames = decision.presentedFrames;
    }
    assert.equal(accepted.length, 5);
  });

  it('accepts rAF ticks when usable so streams without metadata still enqueue', () => {
    const decision = decideVideoFrameAccept({
      usable: true,
      lastMediaTime: 0,
      lastPresentedFrames: 3,
      mediaTime: undefined,
      presentedFrames: undefined,
      rvfcDelivery: false,
      rafTick: true,
    });
    assert.equal(decision.accept, true);
    assert.equal(decision.reason, 'raf-tick');
  });

  it('accepts advancing video.currentTime for remote requireProgress path', () => {
    const decision = decideVideoFrameAccept({
      usable: true,
      lastMediaTime: 1,
      lastPresentedFrames: 2,
      mediaTime: 1,
      presentedFrames: 2,
      rvfcDelivery: true,
      rafTick: false,
      requireProgress: true,
      videoCurrentTime: 4.2,
      lastVideoCurrentTime: 4.0,
    });
    assert.equal(decision.accept, true);
    assert.equal(decision.reason, 'video-current-time');
  });

  it('rejects remote duplicates when requireProgress and nothing advanced', () => {
    const decision = decideVideoFrameAccept({
      usable: true,
      lastMediaTime: 1,
      lastPresentedFrames: 2,
      mediaTime: 1,
      presentedFrames: 2,
      rvfcDelivery: true,
      rafTick: true,
      requireProgress: true,
      videoCurrentTime: 3,
      lastVideoCurrentTime: 3,
    });
    assert.equal(decision.accept, false);
  });
});

describe('videoFramePump rVFC watchdog', () => {
  it('engages rAF fallback when rVFC is silent beyond the watchdog window', () => {
    assert.equal(
      shouldEngageRafFallback({
        cancelled: false,
        usable: true,
        hasRvfcApi: true,
        rafFallbackActive: false,
        lastRvfcAt: 1000,
        now: 1000 + VIDEO_FRAME_PUMP_RVFC_WATCHDOG_MS,
      }),
      true,
    );
  });

  it('does not engage while rVFC is healthy', () => {
    assert.equal(
      shouldEngageRafFallback({
        cancelled: false,
        usable: true,
        hasRvfcApi: true,
        rafFallbackActive: false,
        lastRvfcAt: 1000,
        now: 1000 + VIDEO_FRAME_PUMP_RVFC_WATCHDOG_MS - 1,
      }),
      false,
    );
  });

  it('does not re-engage when fallback is already active (no dual enqueue)', () => {
    assert.equal(
      shouldEngageRafFallback({
        cancelled: false,
        usable: true,
        hasRvfcApi: true,
        rafFallbackActive: true,
        lastRvfcAt: 0,
        now: 5000,
      }),
      false,
    );
  });

  it('engages immediately when the browser has no rVFC API', () => {
    assert.equal(
      shouldEngageRafFallback({
        cancelled: false,
        usable: true,
        hasRvfcApi: false,
        rafFallbackActive: false,
        lastRvfcAt: 0,
        now: 0,
      }),
      true,
    );
  });

  it('ignores stale cancelled pumps', () => {
    assert.equal(
      shouldEngageRafFallback({
        cancelled: true,
        usable: true,
        hasRvfcApi: true,
        rafFallbackActive: false,
        lastRvfcAt: 0,
        now: 5000,
      }),
      false,
    );
  });
});

describe('sameSpacePipelineDebug helpers', () => {
  it('shortId never returns full long identifiers', () => {
    assert.equal(shortId('abcdefghijklmnop'), 'abcdefgh');
    assert.equal(shortId(''), '-');
    assert.equal(shortId(null), '-');
  });

  it('detects sameSpaceDebug query flag', () => {
    assert.equal(isSameSpaceDebugEnabled('?sameSpaceDebug=1'), true);
    assert.equal(isSameSpaceDebugEnabled('?sameSpaceDebug=0'), false);
  });

  it('formats mediaTime for HUD', () => {
    assert.equal(formatDebugMediaTime(Number.NaN), '-');
    assert.equal(formatDebugMediaTime(1.23456), '1.235');
  });
});
