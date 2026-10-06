import assert from 'node:assert/strict';
import test from 'node:test';
import type { BoothSession, BoothShotRow } from './types';
import { canOfferFinalBoothRoomSource, eligibleBoothRoomShotSources } from './roomHandoff';

const session = (status: BoothSession['status']): BoothSession => ({
  id: 'session', coupleId: 'couple', hostUserId: 'a', guestUserId: 'b', status,
  livekitRoomName: 'room', currentShotIndex: 8, selectedShotIndexes: [4, 2],
  hostApproved: true, guestApproved: true, expiresAt: '', finalImagePath: 'couple/session/final.jpg',
  createdAt: '', updatedAt: '',
});
const shot = (id: string, index: number, userId: string, sessionId = 'session'): BoothShotRow => ({
  id, sessionId, userId, shotIndex: index, captureId: `${id}-capture`, imagePath: `couple/session/${userId}/${id}.jpg`, capturedAt: '',
});

test('unfinished capture exposes no Bring to Room sources', () => {
  assert.deepEqual(eligibleBoothRoomShotSources(session('review'), [shot('one', 4, 'a')]), []);
  assert.equal(canOfferFinalBoothRoomSource(session('review')), false);
});

test('completed result offers selected originals in selection order, never unselected shots', () => {
  assert.deepEqual(
    eligibleBoothRoomShotSources(session('completed'), [shot('unselected', 1, 'a'), shot('two-b', 2, 'b'), shot('four-a', 4, 'a'), shot('two-a', 2, 'a')]).map((item) => item.id),
    ['four-a', 'two-a', 'two-b'],
  );
  assert.equal(canOfferFinalBoothRoomSource(session('completed')), true);
});

test('foreign-session and pathless rows are rejected', () => {
  const pathless = { ...shot('pathless', 4, 'a'), imagePath: '' };
  assert.deepEqual(eligibleBoothRoomShotSources(session('completed'), [shot('foreign', 4, 'a', 'other'), pathless]), []);
});
