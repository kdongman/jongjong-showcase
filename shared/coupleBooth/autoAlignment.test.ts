import assert from 'node:assert/strict';
import test from 'node:test';
import { stageRectToPixels } from './coupleBoothStage';
import {
  AUTO_ALIGN_MIN_PERSON_HEIGHT,
  proposeBoothAutoAlignment,
  type AutoAlignmentSubject,
} from './autoAlignment';

function subject(
  participantId: string,
  slot: 'left' | 'right',
  visibleBounds: { x: number; y: number; width: number; height: number } | null,
  sourceVisibleBounds = { x: 0.2, y: 0.04, width: 0.6, height: 0.92 },
): AutoAlignmentSubject {
  return { participantId, slot, visibleBounds, sourceVisibleBounds, sourceAspectRatio: 4 / 3 };
}

function pair(
  left = { x: 0.08, y: 0.18, width: 0.18, height: 0.42 },
  right = { x: 0.62, y: 0.08, width: 0.28, height: 0.76 },
): AutoAlignmentSubject[] {
  return [subject('a', 'left', left), subject('b', 'right', right)];
}

test('different visible source sizes resolve to equivalent apparent height and baseline', () => {
  const result = proposeBoothAutoAlignment({ subjects: pair(), spanMode: 'two_cell' });
  assert.equal(result.status, 'proposed');
  const [left, right] = result.proposals.map((proposal) => proposal.visibleBounds);
  assert.ok(Math.abs(left!.height - right!.height) < 1e-9);
  assert.ok(Math.abs((left!.y + left!.height) - (right!.y + right!.height)) < 1e-9);
});

test('headroom stays inside safe bounds and horizontal pair is centered with a gap', () => {
  const result = proposeBoothAutoAlignment({ subjects: pair(), spanMode: 'two_cell' });
  assert.equal(result.status, 'proposed');
  const [left, right] = result.proposals.map((proposal) => proposal.visibleBounds);
  assert.ok(left!.y >= result.metrics!.safeBounds.y);
  assert.ok(right!.y >= result.metrics!.safeBounds.y);
  assert.ok(right!.x - (left!.x + left!.width) >= result.metrics!.horizontalGap - 1e-9);
  assert.ok(Math.abs(result.metrics!.pairCenterX - 0.5) < 1e-9);
});

test('portrait-ish and landscape-ish source footprints align without distortion', () => {
  const result = proposeBoothAutoAlignment({
    subjects: pair(
      { x: 0.1, y: 0.1, width: 0.16, height: 0.7 },
      { x: 0.55, y: 0.2, width: 0.42, height: 0.58 },
    ),
    spanMode: 'two_cell',
  });
  assert.equal(result.status, 'proposed');
  const [left, right] = result.proposals.map((proposal) => proposal.visibleBounds);
  assert.ok(Math.abs((left!.width / left!.height) - (0.16 / 0.7)) < 1e-9);
  assert.ok(Math.abs((right!.width / right!.height) - (0.42 / 0.58)) < 1e-9);
});

test('missing, degenerate, and single-subject inputs fall back safely', () => {
  assert.equal(proposeBoothAutoAlignment({
    subjects: [subject('a', 'left', null), subject('b', 'right', pair()[1]!.visibleBounds)],
    spanMode: 'two_cell',
  }).reason, 'missing-bounds');
  assert.equal(proposeBoothAutoAlignment({
    subjects: pair({ x: 0, y: 0, width: 0, height: 0 }),
    spanMode: 'two_cell',
  }).reason, 'invalid-bounds');
  const single = proposeBoothAutoAlignment({ subjects: [pair()[0]!], spanMode: 'two_cell' });
  assert.deepEqual(single, {
    status: 'fallback', proposals: [], confidence: 0, reason: 'insufficient-subjects', metrics: null,
  });
});

test('corrupt source bounds never produce NaN, Infinity, or extreme transforms', () => {
  const result = proposeBoothAutoAlignment({
    subjects: [
      subject('a', 'left', pair()[0]!.visibleBounds, { x: 0, y: 0, width: 0, height: 0 }),
      pair()[1]!,
    ],
    spanMode: 'two_cell',
  });
  assert.equal(result.status, 'fallback');
  assert.equal(result.reason, 'unsafe-source-bounds');
  assert.equal(result.proposals.length, 0);
});

test('one_cell and two_cell preserve their expected composition bounds', () => {
  const one = proposeBoothAutoAlignment({ subjects: pair(), spanMode: 'one_cell' });
  const two = proposeBoothAutoAlignment({ subjects: pair(), spanMode: 'two_cell' });
  assert.equal(one.status, 'proposed');
  assert.equal(two.status, 'proposed');
  assert.ok(one.metrics!.safeBounds.width < two.metrics!.safeBounds.width);
  assert.ok(one.proposals[0]!.visibleBounds.x >= one.metrics!.safeBounds.x - 1e-9);
  const right = one.proposals[1]!.visibleBounds;
  assert.ok(right.x + right.width <= one.metrics!.safeBounds.x + one.metrics!.safeBounds.width + 1e-9);
  assert.ok(one.metrics!.targetPersonHeight >= AUTO_ALIGN_MIN_PERSON_HEIGHT);
});

test('preview and 1200x900 export apply the proposal proportionally', () => {
  const result = proposeBoothAutoAlignment({ subjects: pair(), spanMode: 'two_cell' });
  assert.equal(result.status, 'proposed');
  const rect = result.proposals[0]!.visibleBounds;
  const preview = stageRectToPixels(rect, 400, 300);
  const output = stageRectToPixels(rect, 1200, 900);
  for (const ratio of [
    output.x / preview.x,
    output.y / preview.y,
    output.width / preview.width,
    output.height / preview.height,
  ]) {
    assert.ok(Math.abs(ratio - 3) < 1e-9);
  }
});
