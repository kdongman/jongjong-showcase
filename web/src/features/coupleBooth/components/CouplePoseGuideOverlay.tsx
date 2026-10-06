import {
  couplePoseDefinition,
  guidanceForRole,
  type CouplePoseId,
  type CouplePoseRole,
} from '@shared/poseGuide';

type Props = {
  poseId: CouplePoseId;
  localRole: CouplePoseRole | null;
  localStageSide: 'left' | 'right' | null;
  partnerAvailable: boolean;
  mode?: 'full' | 'countdown' | 'hidden';
};

const LEFT_ARROW = 'M 320 345 C 365 330, 400 325, 445 330 M 420 305 L 447 330 L 416 348';
const RIGHT_ARROW = 'M 680 345 C 635 330, 600 325, 555 330 M 580 305 L 553 330 L 584 348';
const LEFT_OUT_ARROW = 'M 440 350 C 390 350, 345 365, 300 400 M 320 365 L 298 400 L 340 395';
const RIGHT_OUT_ARROW = 'M 560 350 C 610 350, 655 365, 700 400 M 680 365 L 702 400 L 660 395';

export function CouplePoseGuideOverlay({
  poseId,
  localRole,
  localStageSide,
  partnerAvailable,
  mode = 'full',
}: Props) {
  if (poseId === 'free' || mode === 'hidden') return null;
  const pose = couplePoseDefinition(poseId);
  const instruction = guidanceForRole(poseId, localRole);
  const leftActive = localStageSide === 'left';
  const rightActive = localStageSide === 'right';
  const minimal = mode === 'countdown';

  return (
    <div
      className={`couple-pose-guide is-${mode}${partnerAvailable ? '' : ' is-solo'}`}
      data-pose-id={poseId}
      data-preview-only="true"
      aria-label={`${pose.displayName}. ${instruction?.instruction ?? 'Follow the shared pose target.'}`}
    >
      <svg className="couple-pose-guide-svg" viewBox="0 0 1000 750" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="pose-guide-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.35" />
          </filter>
        </defs>

        {poseId === 'head-together' ? (
          <>
            <ellipse className="pose-guide-target" cx="500" cy="215" rx="112" ry="74" />
            {!minimal ? <path className={`pose-guide-cue${leftActive ? ' is-mine' : ''}`} d={LEFT_ARROW} /> : null}
            {!minimal ? <path className={`pose-guide-cue${rightActive ? ' is-mine' : ''}`} d={RIGHT_ARROW} /> : null}
          </>
        ) : null}

        {poseId === 'half-heart' ? (
          <>
            <path className={`pose-guide-heart-half${leftActive ? ' is-mine' : ''}`} d="M 500 500 C 430 430, 335 350, 365 275 C 390 215, 470 235, 500 300" />
            <path className={`pose-guide-heart-half${rightActive ? ' is-mine' : ''}`} d="M 500 500 C 570 430, 665 350, 635 275 C 610 215, 530 235, 500 300" />
            {!minimal ? <circle className="pose-guide-target-dot" cx="500" cy="500" r="13" /> : null}
          </>
        ) : null}

        {poseId === 'finger-touch' ? (
          <>
            <circle className="pose-guide-contact-ring" cx="500" cy="360" r="28" />
            <circle className="pose-guide-target-dot" cx="500" cy="360" r="8" />
            {!minimal ? <path className={`pose-guide-cue${leftActive ? ' is-mine' : ''}`} d={LEFT_ARROW} /> : null}
            {!minimal ? <path className={`pose-guide-cue${rightActive ? ' is-mine' : ''}`} d={RIGHT_ARROW} /> : null}
          </>
        ) : null}

        {poseId === 'look-at-each-other' ? (
          <>
            <path className={`pose-guide-eye${leftActive ? ' is-mine' : ''}`} d="M 330 245 Q 390 205 450 245 Q 390 285 330 245 Z M 392 226 A 20 20 0 1 0 392 264 A 20 20 0 1 0 392 226" />
            <path className={`pose-guide-eye${rightActive ? ' is-mine' : ''}`} d="M 670 245 Q 610 205 550 245 Q 610 285 670 245 Z M 608 226 A 20 20 0 1 1 608 264 A 20 20 0 1 1 608 226" />
            {!minimal ? <path className="pose-guide-gaze-line" d="M 420 250 L 480 250 M 580 250 L 520 250" /> : null}
          </>
        ) : null}

        {poseId === 'back-to-back' ? (
          <>
            <path className="pose-guide-center-back" d="M 500 255 L 500 490" />
            {!minimal ? <path className={`pose-guide-cue${leftActive ? ' is-mine' : ''}`} d={LEFT_OUT_ARROW} /> : null}
            {!minimal ? <path className={`pose-guide-cue${rightActive ? ' is-mine' : ''}`} d={RIGHT_OUT_ARROW} /> : null}
          </>
        ) : null}
      </svg>

      {!minimal ? (
        <div className="couple-pose-guide-label" role="status">
          <strong>{pose.displayName}</strong>
          <span>{instruction?.shortInstruction ?? 'Follow the guide'}</span>
          {!partnerAvailable ? <span className="couple-pose-guide-unavailable">Partner unavailable</span> : null}
        </div>
      ) : null}
    </div>
  );
}
