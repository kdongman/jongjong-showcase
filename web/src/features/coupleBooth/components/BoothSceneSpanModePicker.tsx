import {
  BOOTH_SCENE_SPEC_BY_SPAN,
  type BoothSceneSpanMode,
} from '@shared/boothSceneSpec';
import { useI18n } from '../../../lib/i18n';

type Props = {
  value: BoothSceneSpanMode;
  disabled?: boolean;
  lockedHint?: string | null;
  onChange: (mode: BoothSceneSpanMode) => void;
  className?: string;
  label?: string;
};

/** Shared 1칸/2칸 frame selector for live capture and Review. */
export function BoothSceneSpanModePicker({
  value,
  disabled = false,
  lockedHint = null,
  onChange,
  className,
  label = '프레임 너비',
}: Props) {
  const { t } = useI18n();
  const translatedLabel = t(label);
  return (
    <div className={`booth-span-mode ${className ?? ''}`.trim()} role="group" aria-label={translatedLabel}>
      <strong>{translatedLabel}</strong>
      <div className="booth-span-mode-buttons">
        {(['one_cell', 'two_cell'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`booth-span-mode-btn${value === mode ? ' is-active' : ''}`}
            disabled={disabled}
            onClick={() => onChange(mode)}
          >
            {t(BOOTH_SCENE_SPEC_BY_SPAN[mode].labelKo)}
          </button>
        ))}
      </div>
      <p className="muted booth-span-mode-hint">
        {lockedHint ? t(lockedHint) : t(BOOTH_SCENE_SPEC_BY_SPAN[value].descriptionKo)}
      </p>
    </div>
  );
}
