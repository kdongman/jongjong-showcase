import assert from 'node:assert/strict';
import test from 'node:test';
import { canScheduleManualShot, planCaptureAutoStart } from './captureAction';

const ready = {
  partnerConnected: true,
  localReady: true,
  remoteReady: true,
  isHost: true,
  captureStarted: false,
  startInFlight: false,
};

test('both ready auto-start는 90초 clock만 시작하고 shot을 예약하지 않는다', () => {
  const plan = planCaptureAutoStart(ready);
  assert.equal(plan.startClock, true);
  assert.equal(plan.scheduleShot, false);
});

test('camera stage 진입만으로 first shot schedule이 생기지 않는다', () => {
  assert.equal(planCaptureAutoStart(ready).scheduleShot, false);
  assert.equal(planCaptureAutoStart({ ...ready, captureStarted: true }).scheduleShot, false);
});

test('수동 촬영은 clock이 켜진 뒤 host capture action에서만 가능하다', () => {
  assert.equal(canScheduleManualShot({
    isHost: true,
    partnerConnected: true,
    bothReady: true,
    clockActive: true,
    startInFlight: false,
    captureBusy: false,
    pendingCaptureAt: null,
    canScheduleNext: true,
  }), true);
  assert.equal(canScheduleManualShot({
    isHost: true,
    partnerConnected: true,
    bothReady: true,
    clockActive: false,
    startInFlight: false,
    captureBusy: false,
    pendingCaptureAt: null,
    canScheduleNext: true,
  }), false);
});

test('pending schedule / duplicate in-flight는 추가 shot을 막는다', () => {
  assert.equal(canScheduleManualShot({
    isHost: true,
    partnerConnected: true,
    bothReady: true,
    clockActive: true,
    startInFlight: true,
    captureBusy: false,
    pendingCaptureAt: null,
    canScheduleNext: true,
  }), false);
  assert.equal(canScheduleManualShot({
    isHost: true,
    partnerConnected: true,
    bothReady: true,
    clockActive: true,
    startInFlight: false,
    captureBusy: true,
    pendingCaptureAt: null,
    canScheduleNext: true,
  }), false);
  assert.equal(canScheduleManualShot({
    isHost: true,
    partnerConnected: true,
    bothReady: true,
    clockActive: true,
    startInFlight: false,
    captureBusy: false,
    pendingCaptureAt: new Date(Date.now() + 2500).toISOString(),
    canScheduleNext: true,
  }), false);
});
