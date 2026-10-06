import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoothSharedStage, resolveBoothParticipantVisual } from './stage';

test('Shared Studio keeps host left and guest right on every client', () => {
  const stage = createBoothSharedStage('host-id', 'guest-id', {
    'host-id': { mirrorX: true, cameraFacing: 'user' },
    'guest-id': { mirrorX: false, cameraFacing: 'environment' },
  });

  assert.equal(stage.leftParticipantId, 'host-id');
  assert.equal(stage.rightParticipantId, 'guest-id');
  assert.equal(stage.participants['host-id'].mirrorX, true);
  assert.equal(stage.participants['guest-id'].mirrorX, false);
});

test('Shared Studio never infers an unmirrored desktop camera from stale metadata', () => {
  assert.equal(resolveBoothParticipantVisual({ mirrorX: false }).mirrorX, true);
  assert.equal(resolveBoothParticipantVisual({ mirrorX: false, cameraFacing: 'environment' }).mirrorX, false);
  assert.equal(resolveBoothParticipantVisual({ mirrorX: false, mirrorMode: 'manual' }).mirrorX, false);
});

test('Shared Studio defaults unknown desktop cameras to one mirrored presentation', () => {
  const stage = createBoothSharedStage('host-id', 'guest-id');
  assert.deepEqual(stage.participants['host-id'], {
    mirrorX: true,
    cameraFacing: 'unknown',
    mirrorMode: 'auto',
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
});
