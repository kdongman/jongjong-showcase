import { poseForShot } from '@shared/poses';

const POSE_KO: Record<string, string> = {
  'booth.pose.look': '서로를 바라보는 표정',
  'booth.pose.halfHeart': '손으로 반쪽 하트',
  'booth.pose.cute': '가장 귀여운 표정',
  'booth.pose.noLaugh': '웃음 참기',
  'booth.pose.cheek': '볼에 손 올리기',
  'booth.pose.eyesClosed': '눈 감고 미소 짓기',
  'booth.pose.funny': '가장 웃긴 표정',
  'booth.pose.free': '자유 포즈',
};

const POSE_EN: Record<string, string> = {
  'booth.pose.look': 'Look at each other',
  'booth.pose.halfHeart': 'Half-heart with your hand',
  'booth.pose.cute': 'Your cutest face',
  'booth.pose.noLaugh': 'Try not to laugh',
  'booth.pose.cheek': 'Hands on your cheeks',
  'booth.pose.eyesClosed': 'Eyes closed, soft smile',
  'booth.pose.funny': 'Your funniest face',
  'booth.pose.free': 'Free pose',
};

export function posePrompt(shotIndex: number): string {
  const pose = poseForShot(shotIndex);
  const ko = POSE_KO[pose.promptKey] ?? pose.promptKey;
  const en = POSE_EN[pose.promptKey] ?? '';
  return en ? `${ko} · ${en}` : ko;
}
