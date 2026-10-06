import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canStartCapture,
  resetReadyBarrierOnParticipantLifecycle,
} from './readyBarrier';

const ready = {
  partnerConnected: true,
  localReady: true,
  remoteReady: true,
  isHost: true,
  captureStarted: false,
  startInFlight: false,
};

test('partner 없는 상태에서는 start할 수 없다', () => {
  assert.equal(canStartCapture({ ...ready, partnerConnected: false }), false);
});

test('partner가 들어와도 둘 다 Ready 전에는 start할 수 없다', () => {
  assert.equal(canStartCapture({ ...ready, localReady: false, remoteReady: false }), false);
});

test('local만 Ready이면 start할 수 없다', () => {
  assert.equal(canStartCapture({ ...ready, remoteReady: false }), false);
});

test('remote만 Ready이면 start할 수 없다', () => {
  assert.equal(canStartCapture({ ...ready, localReady: false }), false);
});

test('양쪽이 Ready이면 host만 start barrier를 통과한다', () => {
  assert.equal(canStartCapture(ready), true);
  assert.equal(canStartCapture({ ...ready, isHost: false }), false);
});

test('중복 Ready event는 이미 준비된 barrier를 바꾸지 않는다', () => {
  assert.equal(canStartCapture({ ...ready, localReady: true, remoteReady: true }), true);
  assert.equal(canStartCapture({ ...ready, localReady: true, remoteReady: true }), true);
});

test('상대 disconnect는 양쪽 Ready를 reset한다', () => {
  assert.deepEqual(resetReadyBarrierOnParticipantLifecycle(false, null), {
    localReady: false,
    remoteReady: false,
  });
});

test('상대 rejoin lifecycle도 다시 Ready를 요구한다', () => {
  assert.deepEqual(resetReadyBarrierOnParticipantLifecycle(false, 'partner-id'), {
    localReady: false,
    remoteReady: false,
  });
  assert.equal(resetReadyBarrierOnParticipantLifecycle(true, 'partner-id'), null);
});
