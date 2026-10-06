import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCoupleBoothStage,
  createParticipantStageLayers,
  orderCoupleBoothStageLayers,
  stageRectFromPixels,
  stageRectToPixels,
  type BoothStageLayer,
} from './coupleBoothStage';

test('normalized placement is equivalent in preview and 1200x900 export', () => {
  const normalized = { x: 0.38, y: 0.12, width: 0.24, height: 0.7 };
  const preview = stageRectToPixels(normalized, 400, 300);
  const output = stageRectToPixels(normalized, 1200, 900);

  assert.deepEqual(stageRectFromPixels(preview, 400, 300), normalized);
  assert.deepEqual(stageRectFromPixels(output, 1200, 900), normalized);
  assert.equal(output.x / preview.x, 3);
  assert.equal(output.height / preview.height, 3);
});

test('front participant is consistently drawn last', () => {
  assert.deepEqual(
    createParticipantStageLayers(['left', 'right'], 'left').map((layer) => layer.participantId),
    ['right', 'left'],
  );
});

test('stage layer ordering is deterministic and stable within equal z indexes', () => {
  const layers: BoothStageLayer[] = [
    { id: 'frame', kind: 'frame' },
    { id: 'pet-back', kind: 'companion', zIndex: 1 },
    { id: 'person-b', kind: 'participant', zIndex: 2 },
    { id: 'background', kind: 'background' },
    { id: 'person-a', kind: 'participant', zIndex: 1 },
    { id: 'pet-front', kind: 'companion', zIndex: 2 },
    { id: 'foreground', kind: 'foreground' },
    { id: 'effect', kind: 'effect' },
  ];
  assert.deepEqual(
    orderCoupleBoothStageLayers(layers).map((layer) => layer.id),
    ['background', 'person-a', 'person-b', 'pet-back', 'pet-front', 'foreground', 'effect', 'frame'],
  );
});

test('stage supports no companion, one companion, or multiple companions', () => {
  const none = createCoupleBoothStage([{ id: 'bg', kind: 'background' }]);
  assert.equal(none.layers.filter((layer) => layer.kind === 'companion').length, 0);
  const one = createCoupleBoothStage([{ id: 'pet-1', kind: 'companion' }]);
  assert.equal(one.layers.filter((layer) => layer.kind === 'companion').length, 1);
  const many = createCoupleBoothStage([
    { id: 'pet-1', kind: 'companion' },
    { id: 'pet-2', kind: 'companion' },
  ]);
  assert.equal(many.layers.filter((layer) => layer.kind === 'companion').length, 2);
});
