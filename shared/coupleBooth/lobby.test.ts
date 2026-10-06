import assert from 'node:assert/strict';
import test from 'node:test';
import type { BoothSession } from './types';
import {
  canInitializeLocalMedia,
  canShowBoothCameraStage,
  resolveBoothLobbyView,
  resolveBoothReadyCta,
} from './lobby';

function session(status: BoothSession['status'], hostUserId = 'host', guestUserId = 'guest'): BoothSession {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    coupleId: 'couple',
    hostUserId,
    guestUserId,
    status,
    livekitRoomName: 'room',
    currentShotIndex: 0,
    selectedShotIndexes: [],
    hostApproved: false,
    guestApproved: false,
    hostReady: false,
    guestReady: false,
    expiresAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test('로그인 후 active room이 없으면 lobby create 상태다', () => {
  assert.equal(resolveBoothLobbyView(null, 'host'), 'create');
});

test('host가 만든 active room은 waiting 상태로 표시한다', () => {
  assert.equal(resolveBoothLobbyView(session('invited'), 'host'), 'host_waiting');
});

test('guest에게 남은 invited room은 invite 상태로 표시한다', () => {
  assert.equal(resolveBoothLobbyView(session('invited'), 'guest'), 'guest_invite');
});

test('이미 수락했거나 진행 중인 room은 resume 상태로 표시한다', () => {
  assert.equal(resolveBoothLobbyView(session('accepted'), 'guest', 'host'), 'resume');
});

test('room entry만으로 local media를 초기화하지 않는다', () => {
  assert.equal(canInitializeLocalMedia({
    roomConnected: true,
    userPressedPrepare: false,
    localMediaReady: false,
  }), false);
});

test('준비 버튼 이후 room이 연결됐을 때만 local media를 초기화한다', () => {
  assert.equal(canInitializeLocalMedia({
    roomConnected: true,
    userPressedPrepare: true,
    localMediaReady: false,
  }), true);
  assert.equal(canInitializeLocalMedia({
    roomConnected: false,
    userPressedPrepare: true,
    localMediaReady: false,
  }), false);
});

test('양쪽 media가 준비되기 전에는 camera stage를 표시하지 않는다', () => {
  const base = {
    status: 'ready' as const,
    mediaConnectionActive: true,
    localMediaReady: true,
    remoteMediaReady: true,
  };
  assert.equal(canShowBoothCameraStage({ ...base, remoteMediaReady: false }), false);
  assert.equal(canShowBoothCameraStage({ ...base, localMediaReady: false }), false);
  assert.equal(canShowBoothCameraStage(base), true);
});

test('ready 상태에 맞는 CTA 문구를 반환한다', () => {
  assert.equal(resolveBoothReadyCta(false, false), '촬영 준비하기');
  assert.equal(resolveBoothReadyCta(false, true), '나도 준비하기');
  assert.equal(resolveBoothReadyCta(true, true), '나는 준비됐어요');
});
