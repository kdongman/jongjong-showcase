import type { BoothSharedSceneId } from './sharedScene';

export type BoothParticipantLightingSource = 'identity' | 'automatic';

export type BoothParticipantLighting = {
  enabled: boolean;
  /** Multipliers are intentionally bounded to 0.92..1.08. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** Small signed approximation: negative=cooler, positive=warmer. */
  warmth: number;
  source: BoothParticipantLightingSource;
  confidence: number;
};

export type BoothForegroundLightingStatistics = {
  luminance: number;
  warmth: number;
  saturation: number;
  foregroundPixelCount: number;
  confidence: number;
};

export type BoothPairLighting = {
  participantA: BoothParticipantLighting;
  participantB: BoothParticipantLighting;
};

export const BOOTH_LIGHTING_LIMITS = {
  brightnessMin: 0.92,
  brightnessMax: 1.08,
  warmthMin: -0.04,
  warmthMax: 0.04,
  luminanceDeadZone: 0.08,
  warmthDeadZone: 0.055,
} as const;

export const IDENTITY_BOOTH_PARTICIPANT_LIGHTING: BoothParticipantLighting = {
  enabled: false,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  source: 'identity',
  confidence: 0,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min <= 0 && max >= 0 ? 0 : 1;
  return Math.min(max, Math.max(min, value));
}

export function clampBoothParticipantLighting(
  value: Partial<BoothParticipantLighting> | null | undefined,
): BoothParticipantLighting {
  if (!value || value.enabled === false) return { ...IDENTITY_BOOTH_PARTICIPANT_LIGHTING };
  return {
    enabled: true,
    brightness: clamp(Number(value.brightness), BOOTH_LIGHTING_LIMITS.brightnessMin, BOOTH_LIGHTING_LIMITS.brightnessMax),
    contrast: clamp(Number(value.contrast), 0.95, 1.05),
    saturation: clamp(Number(value.saturation), 0.96, 1.04),
    warmth: clamp(Number(value.warmth), BOOTH_LIGHTING_LIMITS.warmthMin, BOOTH_LIGHTING_LIMITS.warmthMax),
    source: value.source === 'automatic' ? 'automatic' : 'identity',
    confidence: clamp(Number(value.confidence), 0, 1),
  };
}

/**
 * Measures only stable foreground pixels. Alpha below 50% and nearly-black
 * fringe pixels are excluded so transparent RGB and segmentation edges cannot
 * steer the estimate.
 */
export function analyzeBoothForegroundPixels(
  rgba: ArrayLike<number> | null | undefined,
): BoothForegroundLightingStatistics | null {
  if (!rgba || rgba.length < 4) return null;
  const samples: Array<{ luminance: number; warmth: number; saturation: number }> = [];
  for (let index = 0; index + 3 < rgba.length; index += 4) {
    const alpha = Number(rgba[index + 3]);
    if (!Number.isFinite(alpha) || alpha < 128) continue;
    const r = clamp(Number(rgba[index]) / 255, 0, 1);
    const g = clamp(Number(rgba[index + 1]) / 255, 0, 1);
    const b = clamp(Number(rgba[index + 2]) / 255, 0, 1);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance < 0.025) continue;
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    samples.push({
      luminance,
      warmth: r - b,
      saturation: maxChannel <= 0.001 ? 0 : (maxChannel - minChannel) / maxChannel,
    });
  }
  if (samples.length < 48) return null;
  samples.sort((a, b) => a.luminance - b.luminance);
  const trim = Math.floor(samples.length * 0.1);
  const stable = samples.slice(trim, Math.max(trim + 1, samples.length - trim));
  if (stable.length < 32) return null;
  const totals = stable.reduce(
    (sum, sample) => ({
      luminance: sum.luminance + sample.luminance,
      warmth: sum.warmth + sample.warmth,
      saturation: sum.saturation + sample.saturation,
    }),
    { luminance: 0, warmth: 0, saturation: 0 },
  );
  return {
    luminance: totals.luminance / stable.length,
    warmth: totals.warmth / stable.length,
    saturation: totals.saturation / stable.length,
    foregroundPixelCount: stable.length,
    confidence: clamp(stable.length / 600, 0, 1),
  };
}

function sceneLightingBias(sceneId: BoothSharedSceneId): { brightness: number; warmth: number } {
  switch (sceneId) {
    case 'photo-studio':
      return { brightness: 0.01, warmth: 0 };
    case 'cozy-room':
      return { brightness: 0, warmth: 0.008 };
    case 'night-booth':
      return { brightness: -0.01, warmth: -0.006 };
    default:
      return { brightness: 0, warmth: 0 };
  }
}

export function resolveBoothPairLighting(
  participantA: BoothForegroundLightingStatistics | null | undefined,
  participantB: BoothForegroundLightingStatistics | null | undefined,
  sceneId: BoothSharedSceneId = 'classic',
  enabled = true,
): BoothPairLighting {
  if (!enabled || !participantA || !participantB) {
    return {
      participantA: { ...IDENTITY_BOOTH_PARTICIPANT_LIGHTING },
      participantB: { ...IDENTITY_BOOTH_PARTICIPANT_LIGHTING },
    };
  }
  const confidence = Math.min(participantA.confidence, participantB.confidence);
  if (!Number.isFinite(confidence) || confidence < 0.08) {
    return {
      participantA: { ...IDENTITY_BOOTH_PARTICIPANT_LIGHTING },
      participantB: { ...IDENTITY_BOOTH_PARTICIPANT_LIGHTING },
    };
  }

  const bias = sceneLightingBias(sceneId);
  const luminanceDelta = participantB.luminance - participantA.luminance;
  const exposureMagnitude = Math.min(
    0.08,
    Math.max(0, Math.abs(luminanceDelta) - BOOTH_LIGHTING_LIMITS.luminanceDeadZone) * 0.34,
  );
  const exposureDirection = Math.sign(luminanceDelta);
  const warmthDelta = participantA.warmth - participantB.warmth;
  const warmthMagnitude = Math.min(
    0.035,
    Math.max(0, Math.abs(warmthDelta) - BOOTH_LIGHTING_LIMITS.warmthDeadZone) * 0.2,
  );
  const warmthDirection = Math.sign(warmthDelta);

  const make = (brightnessDelta: number, warmth: number): BoothParticipantLighting =>
    clampBoothParticipantLighting({
      enabled: true,
      brightness: 1 + brightnessDelta + bias.brightness,
      contrast: 1,
      saturation: 1,
      warmth: warmth + bias.warmth,
      source: 'automatic',
      confidence,
    });

  return {
    participantA: make(exposureMagnitude * exposureDirection, -warmthMagnitude * warmthDirection),
    participantB: make(-exposureMagnitude * exposureDirection, warmthMagnitude * warmthDirection),
  };
}

export function boothParticipantLightingFilter(
  value: BoothParticipantLighting | null | undefined,
): string {
  const lighting = clampBoothParticipantLighting(value);
  if (!lighting.enabled) return 'none';
  const brightness = Math.round(lighting.brightness * 10_000) / 100;
  const contrast = Math.round(lighting.contrast * 10_000) / 100;
  const saturation = Math.round(lighting.saturation * 10_000) / 100;
  const warmthAmount = Math.round(Math.abs(lighting.warmth) * 100);
  const warmth = warmthAmount > 0
    ? ` sepia(${warmthAmount}%) hue-rotate(${lighting.warmth < 0 ? 180 : -8}deg)`
    : '';
  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)${warmth}`;
}

export type BoothLightingModeEvent = {
  type: 'lighting_mode_selected';
  sessionId: string;
  enabled: boolean;
  eventId: string;
  selectedBy: string;
  selectedAt: number;
  version: number;
};

export function createBoothLightingModeEvent(
  input: Omit<BoothLightingModeEvent, 'type'>,
): BoothLightingModeEvent {
  return { type: 'lighting_mode_selected', ...input };
}

export function compareBoothLightingModeEvents(left: BoothLightingModeEvent, right: BoothLightingModeEvent): number {
  if (left.eventId === right.eventId) return 0;
  if (left.version !== right.version) return left.version - right.version;
  if (left.selectedAt !== right.selectedAt) return left.selectedAt - right.selectedAt;
  return left.eventId < right.eventId ? -1 : 1;
}

export function applyBoothLightingModeEvent(
  current: BoothLightingModeEvent | null,
  incoming: BoothLightingModeEvent,
  sessionId: string,
): BoothLightingModeEvent | null {
  if (incoming.sessionId !== sessionId) return current;
  if (!current || current.sessionId !== sessionId) return incoming;
  return compareBoothLightingModeEvents(incoming, current) > 0 ? incoming : current;
}
