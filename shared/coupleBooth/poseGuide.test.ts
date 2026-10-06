import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COUPLE_POSE_DEFINITIONS,
  applyBoothPoseEvent,
  couplePoseDefinition,
  couplePoseRoleForParticipant,
  createBoothPoseEvent,
  poseGuidePointToPixels,
  resolveCouplePoseRoles,
  type BoothPoseEvent,
} from './poseGuide';
import { encodeBoothEvent, parseBoothEvent } from './protocol';

const here = dirname(fileURLToPath(import.meta.url));

function event(overrides: Partial<BoothPoseEvent> = {}): BoothPoseEvent {
  return createBoothPoseEvent({
    sessionId: 'session-one',
    poseId: 'head-together',
    eventId: 'event-1',
    selectedBy: 'user-z',
    selectedAt: 1_000,
    version: 1,
    ...overrides,
  });
}

describe('Couple Pose Guide V1', () => {
  it('defines exactly the six requested capture-safe modes', () => {
    assert.deepEqual(
      COUPLE_POSE_DEFINITIONS.map((pose) => pose.id),
      ['free', 'head-together', 'half-heart', 'finger-touch', 'look-at-each-other', 'back-to-back'],
    );
    assert.equal(COUPLE_POSE_DEFINITIONS.every((pose) => pose.captureSafe.previewOnly), true);
    assert.equal(COUPLE_POSE_DEFINITIONS.some((pose) => pose.captureSafe.includeInCapture), false);
  });

  it('assigns the same stable A/B roles on both local/remote clients', () => {
    const hostView = resolveCouplePoseRoles(['user-z', 'user-a']);
    const guestView = resolveCouplePoseRoles(['user-a', 'user-z']);
    assert.deepEqual(hostView, guestView);
    assert.deepEqual(hostView, { participantAId: 'user-a', participantBId: 'user-z' });
    assert.equal(couplePoseRoleForParticipant('user-z', ['user-z', 'user-a']), 'B');
    assert.equal(couplePoseRoleForParticipant('user-z', ['user-a', 'user-z']), 'B');
  });

  it('keeps a single participant safe while the partner is missing', () => {
    assert.deepEqual(resolveCouplePoseRoles(['user-a']), { participantAId: 'user-a', participantBId: null });
    assert.equal(couplePoseRoleForParticipant('user-a', ['user-a']), 'A');
    assert.equal(couplePoseRoleForParticipant(null, ['user-a']), null);
  });

  it('accepts newer events and ignores stale and duplicate events', () => {
    const current = event({ eventId: 'new', version: 3, selectedAt: 3_000, poseId: 'half-heart' });
    const stale = event({ eventId: 'old', version: 2, selectedAt: 9_000, poseId: 'finger-touch' });
    const duplicate = { ...current };
    const newest = event({ eventId: 'newest', version: 4, selectedAt: 4_000, poseId: 'back-to-back' });
    assert.equal(applyBoothPoseEvent(current, stale, 'session-one'), current);
    assert.equal(applyBoothPoseEvent(current, duplicate, 'session-one'), current);
    assert.equal(applyBoothPoseEvent(current, newest, 'session-one'), newest);
  });

  it('resolves concurrent equal versions deterministically on both clients', () => {
    const a = event({ eventId: 'aaa', selectedAt: 5_000, version: 8, poseId: 'finger-touch' });
    const b = event({ eventId: 'bbb', selectedAt: 5_000, version: 8, poseId: 'look-at-each-other' });
    const left = applyBoothPoseEvent(applyBoothPoseEvent(null, a, 'session-one'), b, 'session-one');
    const right = applyBoothPoseEvent(applyBoothPoseEvent(null, b, 'session-one'), a, 'session-one');
    assert.deepEqual(left, right);
    assert.equal(left?.eventId, 'bbb');
  });

  it('uses Free as a synchronized clearing event', () => {
    const free = event({ eventId: 'free', version: 2, poseId: 'free' });
    assert.equal(applyBoothPoseEvent(event(), free, 'session-one')?.poseId, 'free');
  });

  it('does not inherit pose state into a different session', () => {
    const current = event({ poseId: 'half-heart' });
    const otherSessionEvent = event({ sessionId: 'session-two', eventId: 'other', version: 99 });
    assert.equal(applyBoothPoseEvent(current, otherSessionEvent, 'session-one'), current);
    assert.equal(applyBoothPoseEvent(null, current, 'session-two'), null);
  });

  it('maps normalized targets consistently at desktop and mobile sizes', () => {
    const center = couplePoseDefinition('finger-touch').sharedOverlay!.center;
    assert.deepEqual(poseGuidePointToPixels(center, 1200, 900), { x: 600, y: 432 });
    assert.deepEqual(poseGuidePointToPixels(center, 600, 800), { x: 300, y: 384 });
  });

  it('provides complementary mirrored anchors for directional poses', () => {
    for (const id of ['head-together', 'look-at-each-other', 'back-to-back'] as const) {
      const pose = couplePoseDefinition(id);
      assert.ok(pose.participantA.anchorTarget);
      assert.ok(pose.participantB.anchorTarget);
      assert.ok(Math.abs((pose.participantA.anchorTarget!.x + pose.participantB.anchorTarget!.x) - 1) < 1e-9);
      assert.equal(pose.participantA.anchorTarget!.y, pose.participantB.anchorTarget!.y);
      assert.equal(pose.participantA.direction, pose.participantB.direction);
    }
    const touch = couplePoseDefinition('finger-touch');
    assert.deepEqual(touch.participantA.anchorTarget, touch.participantB.anchorTarget);
  });

  it('round-trips the separate pose event contract', () => {
    const parsed = parseBoothEvent(encodeBoothEvent(event()));
    assert.equal(parsed?.type, 'pose_selected');
    if (parsed?.type === 'pose_selected') assert.equal(parsed.poseId, 'head-together');
  });

  it('keeps overlay DOM out of the canvas capture and export renderers', () => {
    const stage = readFileSync(
      join(here, '../../web/src/features/coupleBooth/components/SameSpaceVideoStage.tsx'),
      'utf8',
    );
    const renderer = readFileSync(
      join(here, '../../web/src/features/coupleBooth/composition/sameSpaceCanvasRenderer.ts'),
      'utf8',
    );
    const exporter = readFileSync(
      join(here, '../../web/src/features/coupleBooth/utils/boothComposer.ts'),
      'utf8',
    );
    assert.match(stage, /snapshotAuthoritativeComposite\(\{\s*compositeCanvas: canvas/);
    assert.match(stage, /<CouplePoseGuideOverlay/);
    assert.doesNotMatch(renderer, /CouplePoseGuideOverlay|poseGuide/);
    assert.doesNotMatch(exporter, /CouplePoseGuideOverlay|poseGuide/);
  });
});
