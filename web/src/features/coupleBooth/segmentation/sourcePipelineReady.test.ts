import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSourcePipelineReadiness,
  shouldInvalidatePumpGeneration,
  shouldReuseSourcePump,
} from './sourcePipelineReady';

describe('sourcePipelineReady — mount races', () => {
  it('rejects remote start when track is present but element is not attached yet', () => {
    const video = {
      readyState: 2,
      videoWidth: 640,
      videoHeight: 480,
      ended: false,
    } as HTMLVideoElement;
    const readiness = evaluateSourcePipelineReadiness({
      video,
      mediaTrackReadyState: 'live',
      attachedToElement: false,
      expectedTrackSid: 'TR_abc',
      pumpTrackSid: null,
      requireLiveTrack: true,
    });
    assert.equal(readiness.ready, false);
    assert.equal(readiness.reason, 'not-attached');
  });

  it('accepts remote start when track already present and attached (invitee mount)', () => {
    const video = {
      readyState: 2,
      videoWidth: 640,
      videoHeight: 480,
      ended: false,
    } as HTMLVideoElement;
    const readiness = evaluateSourcePipelineReadiness({
      video,
      mediaTrackReadyState: 'live',
      attachedToElement: true,
      expectedTrackSid: 'TR_abc',
      pumpTrackSid: null,
      requireLiveTrack: true,
    });
    assert.equal(readiness.ready, true);
  });

  it('rejects zero dimensions so maybeStart can retry after loadedmetadata', () => {
    const video = {
      readyState: 2,
      videoWidth: 0,
      videoHeight: 0,
      ended: false,
    } as HTMLVideoElement;
    const readiness = evaluateSourcePipelineReadiness({
      video,
      mediaTrackReadyState: 'live',
      attachedToElement: true,
      expectedTrackSid: 'TR_abc',
      pumpTrackSid: null,
      requireLiveTrack: true,
    });
    assert.equal(readiness.ready, false);
    assert.equal(readiness.reason, 'zero-dimensions');
  });

  it('reuses the same pump for identical video+sid (no duplicate start)', () => {
    const video = {} as HTMLVideoElement;
    assert.equal(
      shouldReuseSourcePump({
        running: true,
        cancelled: false,
        video,
        pumpVideo: video,
        trackSid: 'TR_1',
        pumpTrackSid: 'TR_1',
      }),
      true,
    );
  });

  it('allows readiness when track SID changed so maybeStart can rebind', () => {
    const video = {
      readyState: 2,
      videoWidth: 640,
      videoHeight: 480,
      ended: false,
    } as HTMLVideoElement;
    const readiness = evaluateSourcePipelineReadiness({
      video,
      mediaTrackReadyState: 'live',
      attachedToElement: true,
      expectedTrackSid: 'TR_new',
      pumpTrackSid: 'TR_old',
      requireLiveTrack: true,
    });
    assert.equal(readiness.ready, true);
    assert.equal(readiness.reason, 'ready');
  });

  it('does not reuse pump when track sid changes', () => {
    const video = {} as HTMLVideoElement;
    assert.equal(
      shouldReuseSourcePump({
        running: true,
        cancelled: false,
        video,
        pumpVideo: video,
        trackSid: 'TR_2',
        pumpTrackSid: 'TR_1',
      }),
      false,
    );
  });

  it('invalidates generation only on track/video/unmount identity changes', () => {
    const a = {} as HTMLVideoElement;
    const b = {} as HTMLVideoElement;
    assert.equal(
      shouldInvalidatePumpGeneration({
        previousTrackSid: 'TR_1',
        nextTrackSid: 'TR_1',
        previousVideo: a,
        nextVideo: a,
        unmounting: false,
      }),
      false,
    );
    assert.equal(
      shouldInvalidatePumpGeneration({
        previousTrackSid: 'TR_1',
        nextTrackSid: 'TR_2',
        previousVideo: a,
        nextVideo: a,
        unmounting: false,
      }),
      true,
    );
    assert.equal(
      shouldInvalidatePumpGeneration({
        previousTrackSid: 'TR_1',
        nextTrackSid: 'TR_1',
        previousVideo: a,
        nextVideo: b,
        unmounting: false,
      }),
      true,
    );
    assert.equal(
      shouldInvalidatePumpGeneration({
        previousTrackSid: 'TR_1',
        nextTrackSid: 'TR_1',
        previousVideo: a,
        nextVideo: a,
        unmounting: true,
      }),
      true,
    );
  });
});
