import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Role-symmetry guards: Same Space live rendering must not branch on isHost /
 * initiator. Host may own edit/capture UX elsewhere; the stage pipeline must
 * treat local/remote identically for both participants.
 */
describe('Same Space role symmetry', () => {
  it('SameSpaceVideoStage source does not branch on isHost or initiator', () => {
    const source = readFileSync(join(here, 'SameSpaceVideoStage.tsx'), 'utf8');
    assert.match(source, /maybeStartSourcePipeline/);
    assert.match(source, /isRemoteVideoSourceLive/);
    assert.match(source, /Intentionally omit hasRemoteTrack/);
    assert.match(source, /createFairFrameScheduler\(\['local', 'remote'\]/);
    assert.equal(/\bisHost\b/.test(source), false);
  });

  it('LivePersonSegmenter does not prefer local over remote in API surface', () => {
    const source = readFileSync(
      join(here, '../segmentation/LivePersonSegmenter.ts'),
      'utf8',
    );
    assert.equal(/\bisHost\b/.test(source), false);
    assert.match(source, /sourceKey: SourceKey/);
    assert.match(source, /downscaleBySource/);
  });
});
