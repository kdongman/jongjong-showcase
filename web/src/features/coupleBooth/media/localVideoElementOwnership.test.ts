import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldClearLocalVideoElement } from './localVideoElementOwnership';

describe('localVideoElementOwnership', () => {
  it('allows cleanup only for the element currently registered', () => {
    const older = { id: 'older' } as unknown as HTMLVideoElement;
    const newer = { id: 'newer' } as unknown as HTMLVideoElement;
    assert.equal(shouldClearLocalVideoElement(newer, older), false);
    assert.equal(shouldClearLocalVideoElement(newer, newer), true);
  });

  it('ignores null/undefined stale cleanups so a new stage stays attached', () => {
    const newer = { id: 'newer' } as unknown as HTMLVideoElement;
    assert.equal(shouldClearLocalVideoElement(newer, null), false);
    assert.equal(shouldClearLocalVideoElement(newer, undefined), false);
    assert.equal(shouldClearLocalVideoElement(null, newer), false);
  });

  it('models BoothVideoStage → SameSpaceVideoStage mount race', () => {
    let registered: HTMLVideoElement | null = null;
    const boothEl = { id: 'booth' } as unknown as HTMLVideoElement;
    const sameSpaceEl = { id: 'same-space' } as unknown as HTMLVideoElement;

    // New stage mounts and registers first (common React effect ordering).
    registered = sameSpaceEl;
    // Old stage cleanup runs later with its own element.
    if (shouldClearLocalVideoElement(registered, boothEl)) registered = null;

    assert.equal(registered, sameSpaceEl);
  });
});
