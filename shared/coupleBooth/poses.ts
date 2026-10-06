import type { BoothPose } from './types';

/** Pose prompts are data — screens look up i18n via promptKey. */
export const DEFAULT_BOOTH_POSES: BoothPose[] = [
  { index: 1, id: 'look', promptKey: 'booth.pose.look' },
  { index: 2, id: 'halfHeart', promptKey: 'booth.pose.halfHeart' },
  { index: 3, id: 'cute', promptKey: 'booth.pose.cute' },
  { index: 4, id: 'noLaugh', promptKey: 'booth.pose.noLaugh' },
  { index: 5, id: 'cheek', promptKey: 'booth.pose.cheek' },
  { index: 6, id: 'eyesClosed', promptKey: 'booth.pose.eyesClosed' },
  { index: 7, id: 'funny', promptKey: 'booth.pose.funny' },
  { index: 8, id: 'free', promptKey: 'booth.pose.free' },
];

export function poseForShot(shotIndex: number): BoothPose {
  return DEFAULT_BOOTH_POSES[shotIndex - 1] ?? DEFAULT_BOOTH_POSES[DEFAULT_BOOTH_POSES.length - 1];
}
