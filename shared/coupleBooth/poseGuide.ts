import { stagePointToPixels, type BoothStagePoint } from './coupleBoothStage';

export const COUPLE_POSE_IDS = [
  'free',
  'head-together',
  'half-heart',
  'finger-touch',
  'look-at-each-other',
  'back-to-back',
] as const;

export type CouplePoseId = (typeof COUPLE_POSE_IDS)[number];
export type CouplePoseRole = 'A' | 'B';
export type CouplePoseDirection = 'none' | 'inward' | 'outward' | 'toward-center';

export type CouplePoseParticipantGuidance = {
  instruction: string;
  shortInstruction: string;
  direction: CouplePoseDirection;
  anchorTarget?: BoothStagePoint;
};

export type CouplePoseOverlayKind = 'head-target' | 'heart' | 'contact' | 'gaze' | 'back-to-back';

export type CouplePoseDefinition = {
  id: CouplePoseId;
  displayName: string;
  compactLabel: string;
  participantA: CouplePoseParticipantGuidance;
  participantB: CouplePoseParticipantGuidance;
  sharedOverlay?: {
    kind: CouplePoseOverlayKind;
    center: BoothStagePoint;
    targetRadius: number;
  };
  recommendedSpacing?: 'default' | 'closer' | 'roomy';
  recommendedAutoAlignmentAdjustment?: 'none' | 'consider-closer-spacing';
  captureSafe: {
    previewOnly: true;
    includeInCapture: false;
  };
};

const PREVIEW_ONLY = { previewOnly: true, includeInCapture: false } as const;

export const COUPLE_POSE_DEFINITIONS: readonly CouplePoseDefinition[] = [
  {
    id: 'free',
    displayName: 'Free',
    compactLabel: 'Free',
    participantA: { instruction: 'Pose however you like', shortInstruction: 'Free pose', direction: 'none' },
    participantB: { instruction: 'Pose however you like', shortInstruction: 'Free pose', direction: 'none' },
    recommendedSpacing: 'default',
    recommendedAutoAlignmentAdjustment: 'none',
    captureSafe: PREVIEW_ONLY,
  },
  {
    id: 'head-together',
    displayName: 'Head Together',
    compactLabel: 'Head',
    participantA: {
      instruction: 'Move closer and lean your head inward',
      shortInstruction: 'Lean inward',
      direction: 'inward',
      anchorTarget: { x: 0.43, y: 0.28 },
    },
    participantB: {
      instruction: 'Move closer and lean your head inward',
      shortInstruction: 'Lean inward',
      direction: 'inward',
      anchorTarget: { x: 0.57, y: 0.28 },
    },
    sharedOverlay: { kind: 'head-target', center: { x: 0.5, y: 0.29 }, targetRadius: 0.1 },
    recommendedSpacing: 'closer',
    recommendedAutoAlignmentAdjustment: 'consider-closer-spacing',
    captureSafe: PREVIEW_ONLY,
  },
  {
    id: 'half-heart',
    displayName: 'Half Heart',
    compactLabel: 'Heart',
    participantA: {
      instruction: 'Shape your half of the heart toward the center',
      shortInstruction: 'Make your half',
      direction: 'toward-center',
      anchorTarget: { x: 0.43, y: 0.45 },
    },
    participantB: {
      instruction: 'Shape your half of the heart toward the center',
      shortInstruction: 'Make your half',
      direction: 'toward-center',
      anchorTarget: { x: 0.57, y: 0.45 },
    },
    sharedOverlay: { kind: 'heart', center: { x: 0.5, y: 0.46 }, targetRadius: 0.19 },
    recommendedSpacing: 'roomy',
    recommendedAutoAlignmentAdjustment: 'none',
    captureSafe: PREVIEW_ONLY,
  },
  {
    id: 'finger-touch',
    displayName: 'Finger Touch',
    compactLabel: 'Touch',
    participantA: {
      instruction: 'Point one finger toward the center target',
      shortInstruction: 'Finger here',
      direction: 'toward-center',
      anchorTarget: { x: 0.5, y: 0.48 },
    },
    participantB: {
      instruction: 'Point one finger toward the center target',
      shortInstruction: 'Finger here',
      direction: 'toward-center',
      anchorTarget: { x: 0.5, y: 0.48 },
    },
    sharedOverlay: { kind: 'contact', center: { x: 0.5, y: 0.48 }, targetRadius: 0.035 },
    recommendedSpacing: 'roomy',
    recommendedAutoAlignmentAdjustment: 'none',
    captureSafe: PREVIEW_ONLY,
  },
  {
    id: 'look-at-each-other',
    displayName: 'Look At Each Other',
    compactLabel: 'Look',
    participantA: {
      instruction: 'Turn your gaze slightly inward',
      shortInstruction: 'Look inward',
      direction: 'inward',
      anchorTarget: { x: 0.48, y: 0.31 },
    },
    participantB: {
      instruction: 'Turn your gaze slightly inward',
      shortInstruction: 'Look inward',
      direction: 'inward',
      anchorTarget: { x: 0.52, y: 0.31 },
    },
    sharedOverlay: { kind: 'gaze', center: { x: 0.5, y: 0.32 }, targetRadius: 0.08 },
    recommendedSpacing: 'default',
    recommendedAutoAlignmentAdjustment: 'none',
    captureSafe: PREVIEW_ONLY,
  },
  {
    id: 'back-to-back',
    displayName: 'Back to Back',
    compactLabel: 'Back',
    participantA: {
      instruction: 'Angle your shoulders slightly outward',
      shortInstruction: 'Angle outward',
      direction: 'outward',
      anchorTarget: { x: 0.39, y: 0.46 },
    },
    participantB: {
      instruction: 'Angle your shoulders slightly outward',
      shortInstruction: 'Angle outward',
      direction: 'outward',
      anchorTarget: { x: 0.61, y: 0.46 },
    },
    sharedOverlay: { kind: 'back-to-back', center: { x: 0.5, y: 0.48 }, targetRadius: 0.12 },
    recommendedSpacing: 'closer',
    recommendedAutoAlignmentAdjustment: 'none',
    captureSafe: PREVIEW_ONLY,
  },
];

const DEFINITIONS_BY_ID = new Map(COUPLE_POSE_DEFINITIONS.map((pose) => [pose.id, pose]));

export function isCouplePoseId(value: unknown): value is CouplePoseId {
  return typeof value === 'string' && (COUPLE_POSE_IDS as readonly string[]).includes(value);
}

export function couplePoseDefinition(poseId: CouplePoseId): CouplePoseDefinition {
  return DEFINITIONS_BY_ID.get(poseId) ?? COUPLE_POSE_DEFINITIONS[0]!;
}

export function resolveCouplePoseRoles(participantIds: readonly string[]): {
  participantAId: string | null;
  participantBId: string | null;
} {
  const stableIds = [...new Set(participantIds.map((id) => id.trim()).filter(Boolean))]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    participantAId: stableIds[0] ?? null,
    participantBId: stableIds[1] ?? null,
  };
}

export function couplePoseRoleForParticipant(
  participantId: string | null | undefined,
  participantIds: readonly string[],
): CouplePoseRole | null {
  if (!participantId) return null;
  const roles = resolveCouplePoseRoles(participantIds);
  if (participantId === roles.participantAId) return 'A';
  if (participantId === roles.participantBId) return 'B';
  return null;
}

export function guidanceForRole(
  poseId: CouplePoseId,
  role: CouplePoseRole | null,
): CouplePoseParticipantGuidance | null {
  if (!role) return null;
  const pose = couplePoseDefinition(poseId);
  return role === 'A' ? pose.participantA : pose.participantB;
}

export type BoothPoseEvent = {
  type: 'pose_selected';
  sessionId: string;
  poseId: CouplePoseId;
  eventId: string;
  selectedBy: string;
  selectedAt: number;
  version: number;
};

export function createBoothPoseEvent(input: Omit<BoothPoseEvent, 'type'>): BoothPoseEvent {
  return { type: 'pose_selected', ...input };
}

/** Positive means `left` is newer. Equal event ids are duplicates. */
export function compareBoothPoseEvents(left: BoothPoseEvent, right: BoothPoseEvent): number {
  if (left.eventId === right.eventId) return 0;
  if (left.version !== right.version) return left.version - right.version;
  if (left.selectedAt !== right.selectedAt) return left.selectedAt - right.selectedAt;
  if (left.eventId !== right.eventId) return left.eventId < right.eventId ? -1 : 1;
  return left.selectedBy < right.selectedBy ? -1 : left.selectedBy > right.selectedBy ? 1 : 0;
}

export function applyBoothPoseEvent(
  current: BoothPoseEvent | null,
  incoming: BoothPoseEvent,
  sessionId: string,
): BoothPoseEvent | null {
  if (incoming.sessionId !== sessionId) return current;
  if (!current || current.sessionId !== sessionId) return incoming;
  return compareBoothPoseEvents(incoming, current) > 0 ? incoming : current;
}

export function poseGuidePointToPixels(
  point: BoothStagePoint,
  previewWidth: number,
  previewHeight: number,
): BoothStagePoint {
  return stagePointToPixels(point, previewWidth, previewHeight);
}
