import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BoothCompanionSnapshot } from './coupleBoothStage';
import {
  applyBoothCompanionReactionTransform,
  boothCompanionReactionForCountdown,
  boothCompanionReactionTransform,
  isBoothCompanionTapGesture,
  resolveBoothCompanionPresentation,
  resolveBoothCompanionExpressionAsset,
  resolveBoothCompanionReaction,
} from './companionReaction';

const companion: BoothCompanionSnapshot = {
  id: 'pet-1',
  renderAsset: { id: 'dog_idle', uri: '/pets/dog.svg' },
  transform: { x: 0.2, y: 0.94, scale: 0.17, rotation: 0, flipX: false },
  zIndex: 0,
};

describe('Booth companion reactions', () => {
  it('keeps idle identity and never mutates persistent placement', () => {
    const base = { ...companion.transform };
    const result = resolveBoothCompanionPresentation(companion, 'idle');
    assert.deepEqual(result.transform, base);
    assert.deepEqual(companion.transform, base);
    assert.notEqual(result.transform, companion.transform);
  });

  it('keeps attention inside the V1 envelope', () => {
    const delta = boothCompanionReactionTransform('attention', 0.2);
    assert.ok(delta.scale >= 0.97);
    assert.ok(delta.scale <= 1.04);
    assert.ok(Math.abs(delta.offsetX) <= 0.01);
    assert.ok(Math.abs(delta.offsetY) <= 0.01);
    assert.ok(Math.abs(delta.rotation) <= 2);
    assert.equal(boothCompanionReactionForCountdown(3), 'attention');
    assert.equal(boothCompanionReactionForCountdown(2), 'idle');
    assert.equal(boothCompanionReactionForCountdown(1), 'attention');
  });

  it('gives shutter priority over every local reaction', () => {
    assert.equal(resolveBoothCompanionReaction(['tap', 'attention', 'shutter']), 'shutter');
    assert.equal(resolveBoothCompanionReaction(['attention', 'postCapture', 'tap']), 'postCapture');
  });

  it('resets to base and resolves deterministic shutter snapshots', () => {
    const a = resolveBoothCompanionPresentation(companion, 'shutter');
    const b = resolveBoothCompanionPresentation(companion, 'shutter');
    assert.deepEqual(a, b);
    assert.deepEqual(applyBoothCompanionReactionTransform(a.transform, 'idle'), a.transform);
    assert.deepEqual(resolveBoothCompanionPresentation(companion, 'idle').transform, companion.transform);
  });

  it('distinguishes a tap from a drag at a six-pixel threshold', () => {
    assert.equal(isBoothCompanionTapGesture(3, 4), true);
    assert.equal(isBoothCompanionTapGesture(6, 0), false);
    assert.equal(isBoothCompanionTapGesture(12, 2), false);
  });

  it('falls back immediately when an optional happy asset is missing', () => {
    assert.deepEqual(
      resolveBoothCompanionExpressionAsset(companion.renderAsset, null),
      companion.renderAsset,
    );
  });
});
