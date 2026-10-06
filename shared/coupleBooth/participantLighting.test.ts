import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOOTH_LIGHTING_LIMITS,
  IDENTITY_BOOTH_PARTICIPANT_LIGHTING,
  analyzeBoothForegroundPixels,
  applyBoothLightingModeEvent,
  boothParticipantLightingFilter,
  clampBoothParticipantLighting,
  createBoothLightingModeEvent,
  resolveBoothPairLighting,
  type BoothForegroundLightingStatistics,
} from './participantLighting';
import { encodeBoothEvent, parseBoothEvent } from './protocol';
import { createCoupleBoothStage } from './coupleBoothStage';

const here = dirname(fileURLToPath(import.meta.url));

function solidPixels(r: number, g: number, b: number, alpha: number, count = 100): Uint8ClampedArray {
  const out = new Uint8ClampedArray(count * 4);
  for (let index = 0; index < count; index += 1) {
    out[index * 4] = r;
    out[index * 4 + 1] = g;
    out[index * 4 + 2] = b;
    out[index * 4 + 3] = alpha;
  }
  return out;
}

function stats(luminance: number, warmth = 0): BoothForegroundLightingStatistics {
  return { luminance, warmth, saturation: 0.25, foregroundPixelCount: 500, confidence: 0.9 };
}

describe('Same Space Lighting V1', () => {
  it('keeps equal lighting at identity inside the dead zone', () => {
    const pair = resolveBoothPairLighting(stats(0.5, 0.02), stats(0.53, -0.01), 'classic');
    assert.equal(pair.participantA.brightness, 1);
    assert.equal(pair.participantB.brightness, 1);
    assert.equal(pair.participantA.warmth, 0);
    assert.equal(pair.participantB.warmth, 0);
  });

  it('converges a bright/dark pair symmetrically within bounded exposure', () => {
    const pair = resolveBoothPairLighting(stats(0.22), stats(0.78), 'classic');
    assert.equal(pair.participantA.brightness, BOOTH_LIGHTING_LIMITS.brightnessMax);
    assert.equal(pair.participantB.brightness, BOOTH_LIGHTING_LIMITS.brightnessMin);
    assert.ok(pair.participantA.brightness > 1);
    assert.ok(pair.participantB.brightness < 1);
  });

  it('moves warm and cool participants conservatively toward a midpoint', () => {
    const pair = resolveBoothPairLighting(stats(0.5, 0.22), stats(0.5, -0.18), 'classic');
    assert.ok(pair.participantA.warmth < 0);
    assert.ok(pair.participantB.warmth > 0);
    assert.ok(Math.abs(pair.participantA.warmth) <= 0.035);
    assert.ok(Math.abs(pair.participantB.warmth) <= 0.035);
  });

  it('clamps extreme and invalid metadata to safe finite values', () => {
    const result = clampBoothParticipantLighting({
      enabled: true,
      brightness: 99,
      contrast: -20,
      saturation: Number.POSITIVE_INFINITY,
      warmth: -8,
      source: 'automatic',
      confidence: 12,
    });
    assert.equal(result.brightness, BOOTH_LIGHTING_LIMITS.brightnessMax);
    assert.equal(result.contrast, 0.95);
    assert.equal(result.saturation, 1);
    assert.equal(result.warmth, BOOTH_LIGHTING_LIMITS.warmthMin);
    assert.equal(result.confidence, 1);
    assert.equal(Object.values(result).some((value) => typeof value === 'number' && !Number.isFinite(value)), false);
  });

  it('ignores fully transparent background pixels', () => {
    const transparentRed = solidPixels(255, 0, 0, 0, 200);
    const opaqueGray = solidPixels(128, 128, 128, 255, 100);
    const combined = new Uint8ClampedArray(transparentRed.length + opaqueGray.length);
    combined.set(transparentRed);
    combined.set(opaqueGray, transparentRed.length);
    const measured = analyzeBoothForegroundPixels(combined);
    const grayOnly = analyzeBoothForegroundPixels(opaqueGray);
    assert.ok(measured && grayOnly);
    assert.ok(Math.abs(measured.luminance - grayOnly.luminance) < 1e-9);
    assert.ok(Math.abs(measured.warmth) < 1e-9);
  });

  it('ignores near-transparent alpha edges', () => {
    const fringe = solidPixels(255, 255, 255, 40, 300);
    const subject = solidPixels(90, 100, 110, 255, 100);
    const combined = new Uint8ClampedArray(fringe.length + subject.length);
    combined.set(fringe);
    combined.set(subject, fringe.length);
    const measured = analyzeBoothForegroundPixels(combined);
    const expected = analyzeBoothForegroundPixels(subject);
    assert.deepEqual(measured, expected);
  });

  it('falls back to identity for invalid or insufficient sources', () => {
    assert.equal(analyzeBoothForegroundPixels(null), null);
    assert.equal(analyzeBoothForegroundPixels(solidPixels(100, 100, 100, 255, 20)), null);
    assert.deepEqual(resolveBoothPairLighting(null, stats(0.5)), {
      participantA: IDENTITY_BOOTH_PARTICIPANT_LIGHTING,
      participantB: IDENTITY_BOOTH_PARTICIPANT_LIGHTING,
    });
  });

  it('is deterministic for identical statistics', () => {
    const inputA = stats(0.31, 0.16);
    const inputB = stats(0.69, -0.12);
    assert.deepEqual(
      resolveBoothPairLighting(inputA, inputB, 'cozy-room'),
      resolveBoothPairLighting(inputA, inputB, 'cozy-room'),
    );
  });

  it('keeps scene bias small and bounded', () => {
    const classic = resolveBoothPairLighting(stats(0.5), stats(0.5), 'classic');
    const studio = resolveBoothPairLighting(stats(0.5), stats(0.5), 'photo-studio');
    const cozy = resolveBoothPairLighting(stats(0.5), stats(0.5), 'cozy-room');
    const night = resolveBoothPairLighting(stats(0.5), stats(0.5), 'night-booth');
    assert.ok(Math.abs((studio.participantA.brightness - classic.participantA.brightness) - 0.01) < 1e-9);
    assert.equal(cozy.participantA.warmth, 0.008);
    assert.equal(night.participantA.brightness, 0.99);
    assert.equal(night.participantA.warmth, -0.006);
  });

  it('does not alter canonical stage geometry', () => {
    const before = createCoupleBoothStage([{ id: 'a', kind: 'participant', participantId: 'a' }]);
    resolveBoothPairLighting(stats(0.2), stats(0.8), 'photo-studio');
    const after = createCoupleBoothStage([{ id: 'a', kind: 'participant', participantId: 'a' }]);
    assert.deepEqual(after, before);
  });

  it('uses equivalent participant filter parameters at every render size', () => {
    const lighting = resolveBoothPairLighting(stats(0.2, 0.14), stats(0.7, -0.1), 'classic').participantA;
    const previewFilter = boothParticipantLightingFilter(lighting);
    const exportFilter = boothParticipantLightingFilter(lighting);
    assert.equal(previewFilter, exportFilter);
    assert.doesNotMatch(previewFilter, /blur|drop-shadow/);
  });

  it('round-trips and orders the synchronized On/Off mode', () => {
    const on = createBoothLightingModeEvent({
      sessionId: 'session-one', enabled: true, eventId: 'on', selectedBy: 'user-a', selectedAt: 1, version: 1,
    });
    const off = createBoothLightingModeEvent({
      sessionId: 'session-one', enabled: false, eventId: 'off', selectedBy: 'user-b', selectedAt: 2, version: 2,
    });
    assert.equal(applyBoothLightingModeEvent(on, off, 'session-one')?.enabled, false);
    const parsed = parseBoothEvent(encodeBoothEvent(off));
    assert.equal(parsed?.type, 'lighting_mode_selected');
  });

  it('isolates filters to participant draws and never passes companions through lighting', () => {
    const renderer = readFileSync(
      join(here, '../../web/src/features/coupleBooth/composition/sameSpaceCanvasRenderer.ts'),
      'utf8',
    );
    const exporter = readFileSync(
      join(here, '../../web/src/features/coupleBooth/utils/boothComposer.ts'),
      'utf8',
    );
    assert.match(renderer, /ctx\.filter = boothParticipantLightingFilter\(layer\.lighting\)/);
    const companionSection = exporter.slice(
      exporter.indexOf('for (const layer of companionLayers)'),
      exporter.indexOf('for (const foreground of sharedSceneForegrounds)'),
    );
    assert.doesNotMatch(companionSection, /lighting|ctx\.filter/);
  });
});
