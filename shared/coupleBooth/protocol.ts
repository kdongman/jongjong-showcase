import { COUPLE_BOOTH_PROTOCOL_VERSION } from './types';
import { isCouplePoseId, type BoothPoseEvent } from './poseGuide';
import { isBoothSharedSceneId, type BoothSharedSceneEvent } from './sharedScene';
import type { BoothLightingModeEvent } from './participantLighting';
import { normalizeBoothCompanionPlacements, type BoothCompanionStateEvent } from './companionState';

export type BoothRealtimeEvent =
  | BoothPoseEvent
  | BoothSharedSceneEvent
  | BoothLightingModeEvent
  | BoothCompanionStateEvent
  | {
      type: 'ready';
      userId: string;
      protocolVersion: number;
    }
  | {
      type: 'protocol_mismatch';
      userId: string;
      protocolVersion: number;
      peerProtocolVersion: number;
    }
  | {
      type: 'ping';
      userId: string;
      sentAt: number;
    }
  | {
      type: 'pong';
      userId: string;
      pingSentAt: number;
      receivedAt: number;
    }
  | {
      type: 'capture_scheduled';
      captureId: string;
      shotIndex: number;
      captureAt: number;
    }
  | {
      type: 'capture_completed';
      captureId: string;
      shotIndex: number;
      userId: string;
      localCapturedAt: number;
    }
  | {
      type: 'upload_completed';
      captureId: string;
      shotIndex: number;
      userId: string;
      storagePath: string;
    }
  | {
      type: 'capture_failed';
      captureId: string;
      shotIndex: number;
      userId: string;
      reason: string;
    }
  | {
      type: 'session_cancelled';
      reason: string;
    }
  | {
      type: 'selection_updated';
      selectedShotIndexes: number[];
    }
  | {
      type: 'approval_updated';
      hostApproved: boolean;
      guestApproved: boolean;
    }
  | {
      /** Optimistic seat assignment preview (before RPC ack). */
      type: 'positions_preview';
      userId: string;
      leftParticipantId: string;
      rightParticipantId: string;
      participantTransforms?: Record<string, { offsetX: number; offsetY: number; scale: number }>;
    }
  | {
      /** Live manual drag preview for one participant. */
      type: 'transform_preview';
      userId: string;
      offsetX: number;
      offsetY: number;
      scale: number;
    }
  | {
      type: 'background_preview';
      userId: string;
      backgroundKey: string;
    }
  | {
      type: 'color_mode_preview';
      userId: string;
      colorMode: 'color' | 'monochrome';
    }
  | {
      /** Live scene span (1칸/2칸) preview before Review persistence. */
      type: 'scene_span_preview';
      userId: string;
      sceneSpanMode: 'one_cell' | 'two_cell';
    }
  | {
      type: 'capture_viewport_mode';
      userId: string;
      captureViewportMode: 'desktop' | 'mobile';
    }
  | {
      type: 'same_space_mode_preview';
      userId: string;
      sameSpaceEnabled: boolean;
    };

const EVENT_TYPES = new Set([
  'pose_selected',
  'scene_selected',
  'lighting_mode_selected',
  'companion_state_changed',
  'ready',
  'protocol_mismatch',
  'ping',
  'pong',
  'capture_scheduled',
  'capture_completed',
  'upload_completed',
  'capture_failed',
  'session_cancelled',
  'selection_updated',
  'approval_updated',
  'positions_preview',
  'transform_preview',
  'background_preview',
  'color_mode_preview',
  'scene_span_preview',
  'capture_viewport_mode',
  'same_space_mode_preview',
]);

function isUuidLike(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f-]{8,}$/i.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Runtime validation — never trust data packets via type assertion alone. */
export function parseBoothEvent(data: Uint8Array | ArrayBuffer | string): BoothRealtimeEvent | null {
  try {
    const text =
      typeof data === 'string'
        ? data
        : new TextDecoder().decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== COUPLE_BOOTH_PROTOCOL_VERSION) return null;
    if (typeof parsed.type !== 'string' || !EVENT_TYPES.has(parsed.type)) return null;

    switch (parsed.type) {
      case 'companion_state_changed': {
        if (
          typeof parsed.sessionId !== 'string'
          || !Array.isArray(parsed.companions)
          || typeof parsed.eventId !== 'string'
          || !parsed.eventId
          || typeof parsed.selectedBy !== 'string'
          || !parsed.selectedBy
          || !isFiniteNumber(parsed.selectedAt)
          || !isFiniteNumber(parsed.version)
          || parsed.version < 0
        ) return null;
        const valid = parsed.companions.every((item) => {
          if (!item || typeof item !== 'object') return false;
          const value = item as Record<string, unknown>;
          return typeof value.petId === 'string' && Boolean(value.petId)
            && isFiniteNumber(value.x) && isFiniteNumber(value.y)
            && isFiniteNumber(value.scale) && typeof value.flipX === 'boolean'
            && isFiniteNumber(value.zIndex);
        });
        if (!valid) return null;
        return {
          type: 'companion_state_changed',
          sessionId: parsed.sessionId,
          companions: normalizeBoothCompanionPlacements(parsed.companions as BoothCompanionStateEvent['companions']),
          eventId: parsed.eventId,
          selectedBy: parsed.selectedBy,
          selectedAt: parsed.selectedAt,
          version: parsed.version,
        };
      }
      case 'lighting_mode_selected':
        if (
          typeof parsed.sessionId !== 'string'
          || typeof parsed.enabled !== 'boolean'
          || typeof parsed.eventId !== 'string'
          || !parsed.eventId
          || typeof parsed.selectedBy !== 'string'
          || !parsed.selectedBy
          || !isFiniteNumber(parsed.selectedAt)
          || !isFiniteNumber(parsed.version)
          || parsed.version < 0
        ) return null;
        return {
          type: 'lighting_mode_selected',
          sessionId: parsed.sessionId,
          enabled: parsed.enabled,
          eventId: parsed.eventId,
          selectedBy: parsed.selectedBy,
          selectedAt: parsed.selectedAt,
          version: parsed.version,
        };
      case 'scene_selected':
        if (
          typeof parsed.sessionId !== 'string'
          || !isBoothSharedSceneId(parsed.sceneId)
          || typeof parsed.eventId !== 'string'
          || !parsed.eventId
          || typeof parsed.selectedBy !== 'string'
          || !parsed.selectedBy
          || !isFiniteNumber(parsed.selectedAt)
          || !isFiniteNumber(parsed.version)
          || parsed.version < 0
        ) return null;
        return {
          type: 'scene_selected',
          sessionId: parsed.sessionId,
          sceneId: parsed.sceneId,
          eventId: parsed.eventId,
          selectedBy: parsed.selectedBy,
          selectedAt: parsed.selectedAt,
          version: parsed.version,
        };
      case 'pose_selected':
        if (
          typeof parsed.sessionId !== 'string'
          || !isCouplePoseId(parsed.poseId)
          || typeof parsed.eventId !== 'string'
          || !parsed.eventId
          || typeof parsed.selectedBy !== 'string'
          || !parsed.selectedBy
          || !isFiniteNumber(parsed.selectedAt)
          || !isFiniteNumber(parsed.version)
          || parsed.version < 0
        ) return null;
        return {
          type: 'pose_selected',
          sessionId: parsed.sessionId,
          poseId: parsed.poseId,
          eventId: parsed.eventId,
          selectedBy: parsed.selectedBy,
          selectedAt: parsed.selectedAt,
          version: parsed.version,
        };
      case 'ready':
        if (typeof parsed.userId !== 'string' || !isFiniteNumber(parsed.protocolVersion)) return null;
        return {
          type: 'ready',
          userId: parsed.userId,
          protocolVersion: parsed.protocolVersion,
        };
      case 'protocol_mismatch':
        if (
          typeof parsed.userId !== 'string' ||
          !isFiniteNumber(parsed.protocolVersion) ||
          !isFiniteNumber(parsed.peerProtocolVersion)
        ) {
          return null;
        }
        return {
          type: 'protocol_mismatch',
          userId: parsed.userId,
          protocolVersion: parsed.protocolVersion,
          peerProtocolVersion: parsed.peerProtocolVersion,
        };
      case 'ping':
        if (typeof parsed.userId !== 'string' || !isFiniteNumber(parsed.sentAt)) return null;
        return { type: 'ping', userId: parsed.userId, sentAt: parsed.sentAt };
      case 'pong':
        if (
          typeof parsed.userId !== 'string' ||
          !isFiniteNumber(parsed.pingSentAt) ||
          !isFiniteNumber(parsed.receivedAt)
        ) {
          return null;
        }
        return {
          type: 'pong',
          userId: parsed.userId,
          pingSentAt: parsed.pingSentAt,
          receivedAt: parsed.receivedAt,
        };
      case 'capture_scheduled':
        if (
          !isUuidLike(parsed.captureId) ||
          !isFiniteNumber(parsed.shotIndex) ||
          parsed.shotIndex < 1 ||
          parsed.shotIndex > 8 ||
          !isFiniteNumber(parsed.captureAt)
        ) {
          return null;
        }
        return {
          type: 'capture_scheduled',
          captureId: String(parsed.captureId),
          shotIndex: parsed.shotIndex,
          captureAt: parsed.captureAt,
        };
      case 'capture_completed':
      case 'upload_completed':
        if (
          !isUuidLike(parsed.captureId) ||
          !isFiniteNumber(parsed.shotIndex) ||
          typeof parsed.userId !== 'string'
        ) {
          return null;
        }
        if (parsed.type === 'capture_completed') {
          if (!isFiniteNumber(parsed.localCapturedAt)) return null;
          return {
            type: 'capture_completed',
            captureId: String(parsed.captureId),
            shotIndex: parsed.shotIndex,
            userId: parsed.userId,
            localCapturedAt: parsed.localCapturedAt,
          };
        }
        if (typeof parsed.storagePath !== 'string' || !parsed.storagePath) return null;
        return {
          type: 'upload_completed',
          captureId: String(parsed.captureId),
          shotIndex: parsed.shotIndex,
          userId: parsed.userId,
          storagePath: parsed.storagePath,
        };
      case 'capture_failed':
        if (
          !isUuidLike(parsed.captureId) ||
          !isFiniteNumber(parsed.shotIndex) ||
          typeof parsed.userId !== 'string' ||
          typeof parsed.reason !== 'string'
        ) {
          return null;
        }
        return {
          type: 'capture_failed',
          captureId: String(parsed.captureId),
          shotIndex: parsed.shotIndex,
          userId: parsed.userId,
          reason: parsed.reason,
        };
      case 'session_cancelled':
        if (typeof parsed.reason !== 'string') return null;
        return { type: 'session_cancelled', reason: parsed.reason };
      case 'selection_updated':
        if (!Array.isArray(parsed.selectedShotIndexes)) return null;
        if (!parsed.selectedShotIndexes.every((value) => isFiniteNumber(value) && value >= 1 && value <= 8)) {
          return null;
        }
        return {
          type: 'selection_updated',
          selectedShotIndexes: parsed.selectedShotIndexes as number[],
        };
      case 'approval_updated':
        if (typeof parsed.hostApproved !== 'boolean' || typeof parsed.guestApproved !== 'boolean') return null;
        return {
          type: 'approval_updated',
          hostApproved: parsed.hostApproved,
          guestApproved: parsed.guestApproved,
        };
      case 'positions_preview': {
        if (
          typeof parsed.userId !== 'string'
          || typeof parsed.leftParticipantId !== 'string'
          || typeof parsed.rightParticipantId !== 'string'
        ) {
          return null;
        }
        const transformsRaw = parsed.participantTransforms;
        let participantTransforms: Record<string, { offsetX: number; offsetY: number; scale: number }> | undefined;
        if (transformsRaw && typeof transformsRaw === 'object' && !Array.isArray(transformsRaw)) {
          participantTransforms = {};
          for (const [key, value] of Object.entries(transformsRaw as Record<string, unknown>)) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
            const row = value as Record<string, unknown>;
            if (!isFiniteNumber(row.offsetX) || !isFiniteNumber(row.offsetY) || !isFiniteNumber(row.scale)) continue;
            participantTransforms[key] = {
              offsetX: row.offsetX,
              offsetY: row.offsetY,
              scale: row.scale,
            };
          }
        }
        return {
          type: 'positions_preview',
          userId: parsed.userId,
          leftParticipantId: parsed.leftParticipantId,
          rightParticipantId: parsed.rightParticipantId,
          participantTransforms,
        };
      }
      case 'transform_preview':
        if (
          typeof parsed.userId !== 'string'
          || !isFiniteNumber(parsed.offsetX)
          || !isFiniteNumber(parsed.offsetY)
          || !isFiniteNumber(parsed.scale)
        ) {
          return null;
        }
        return {
          type: 'transform_preview',
          userId: parsed.userId,
          offsetX: parsed.offsetX,
          offsetY: parsed.offsetY,
          scale: parsed.scale,
        };
      case 'background_preview':
        if (typeof parsed.userId !== 'string' || typeof parsed.backgroundKey !== 'string') return null;
        return {
          type: 'background_preview',
          userId: parsed.userId,
          backgroundKey: parsed.backgroundKey,
        };
      case 'color_mode_preview':
        if (
          typeof parsed.userId !== 'string'
          || (parsed.colorMode !== 'color' && parsed.colorMode !== 'monochrome')
        ) {
          return null;
        }
        return {
          type: 'color_mode_preview',
          userId: parsed.userId,
          colorMode: parsed.colorMode,
        };
      case 'scene_span_preview':
        if (
          typeof parsed.userId !== 'string'
          || (parsed.sceneSpanMode !== 'one_cell' && parsed.sceneSpanMode !== 'two_cell')
        ) {
          return null;
        }
        return {
          type: 'scene_span_preview',
          userId: parsed.userId,
          sceneSpanMode: parsed.sceneSpanMode,
        };
      case 'capture_viewport_mode':
        if (
          typeof parsed.userId !== 'string'
          || (parsed.captureViewportMode !== 'desktop' && parsed.captureViewportMode !== 'mobile')
        ) return null;
        return {
          type: 'capture_viewport_mode',
          userId: parsed.userId,
          captureViewportMode: parsed.captureViewportMode,
        };
      case 'same_space_mode_preview':
        if (typeof parsed.userId !== 'string' || typeof parsed.sameSpaceEnabled !== 'boolean') return null;
        return {
          type: 'same_space_mode_preview',
          userId: parsed.userId,
          sameSpaceEnabled: parsed.sameSpaceEnabled,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function encodeBoothEvent(event: BoothRealtimeEvent): Uint8Array {
  const payload = JSON.stringify({ v: COUPLE_BOOTH_PROTOCOL_VERSION, ...event });
  return new TextEncoder().encode(payload);
}

export function isBoothRealtimeEvent(value: unknown): value is BoothRealtimeEvent {
  if (!value || typeof value !== 'object') return false;
  return parseBoothEvent(JSON.stringify({ v: COUPLE_BOOTH_PROTOCOL_VERSION, ...(value as object) })) != null;
}

export function protocolsCompatible(peerVersion: number | null | undefined): boolean {
  return peerVersion === COUPLE_BOOTH_PROTOCOL_VERSION;
}
