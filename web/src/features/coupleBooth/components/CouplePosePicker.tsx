import { COUPLE_POSE_DEFINITIONS, type CouplePoseId } from '@shared/poseGuide';

type Props = {
  activePoseId: CouplePoseId;
  disabled?: boolean;
  onSelect: (poseId: CouplePoseId) => void;
};

export function CouplePosePicker({ activePoseId, disabled = false, onSelect }: Props) {
  return (
    <div className="couple-pose-picker" role="group" aria-label="Couple pose guide">
      {COUPLE_POSE_DEFINITIONS.map((pose) => {
        const active = pose.id === activePoseId;
        return (
          <button
            key={pose.id}
            type="button"
            className={`couple-pose-picker-option${active ? ' is-active' : ''}`}
            aria-pressed={active}
            title={pose.displayName}
            disabled={disabled}
            onClick={() => onSelect(pose.id)}
          >
            <span aria-hidden="true" className="couple-pose-picker-check">{active ? '✓' : '·'}</span>
            <span>{pose.compactLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
