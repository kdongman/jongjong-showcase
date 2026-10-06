import { useEffect, useMemo, useState } from 'react';
import {
  SAME_SPACE_BACKGROUND_CATEGORY_LABELS,
  SAME_SPACE_BACKGROUND_PRESETS,
  backgroundPresetThumbnailDataUrl,
  presetsForCategory,
  type SameSpaceBackgroundCategory,
  type SameSpaceBackgroundKey,
} from '@shared/sameSpaceBackgroundPresets';
import { useI18n } from '../../../lib/i18n';

type Props = {
  open: boolean;
  selectedKey?: SameSpaceBackgroundKey;
  onClose: () => void;
  onSelect: (key: SameSpaceBackgroundKey) => void;
  ourRoomSelected?: boolean;
  ourRoomPreviewUrl?: string;
  includePets?: boolean;
  preparingOurRoom?: boolean;
  ourRoomDisabled?: boolean;
  onSelectOurRoom?: () => void;
  onIncludePetsChange?: (include: boolean) => void;
};

const CATEGORIES: SameSpaceBackgroundCategory[] = ['studio', 'photo_booth', 'mood'];

export function SameSpaceBackgroundPicker({
  open,
  selectedKey,
  onClose,
  onSelect,
  ourRoomSelected = false,
  ourRoomPreviewUrl,
  includePets = true,
  preparingOurRoom = false,
  ourRoomDisabled = false,
  onSelectOurRoom,
  onIncludePetsChange,
}: Props) {
  const { t } = useI18n();
  const [category, setCategory] = useState<SameSpaceBackgroundCategory>('studio');
  const thumbs = useMemo(() => {
    if (typeof document === 'undefined') return {} as Record<string, string>;
    const map: Record<string, string> = {};
    for (const preset of SAME_SPACE_BACKGROUND_PRESETS) {
      map[preset.key] = backgroundPresetThumbnailDataUrl(preset.key);
    }
    return map;
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rows = presetsForCategory(category);

  return (
    <div className="same-space-bg-picker" role="dialog" aria-label={t('배경 선택')}>
      <div className="same-space-bg-picker-bar">
        <div className="same-space-bg-picker-tabs" role="tablist">
          {CATEGORIES.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={category === id}
              className={`same-space-bg-picker-tab${category === id ? ' is-active' : ''}`}
              onClick={() => setCategory(id)}
            >
              {SAME_SPACE_BACKGROUND_CATEGORY_LABELS[id]}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost same-space-bg-picker-close" onClick={onClose}>
          {t('닫기')}
        </button>
      </div>
      <div className="same-space-bg-picker-scroller" role="list">
        <button
          type="button"
          role="listitem"
          className={`same-space-bg-thumb same-space-bg-thumb-room${ourRoomSelected ? ' is-selected' : ''}`}
          aria-pressed={ourRoomSelected}
          disabled={ourRoomDisabled || preparingOurRoom}
          onClick={onSelectOurRoom}
        >
          <span className="same-space-bg-thumb-swatch" style={ourRoomPreviewUrl
            ? { backgroundImage: `url(${ourRoomPreviewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: 'linear-gradient(160deg, #EFE8F5 0 58%, #D9BE9F 58% 100%)' }} />
          <span className="same-space-bg-thumb-label">
            {preparingOurRoom ? t('우리 방 준비 중…') : t('우리 방')}
            <small>{t('함께 꾸민 방')}</small>
          </span>
          {ourRoomSelected ? <span className="same-space-bg-thumb-check" aria-hidden>✓</span> : null}
        </button>
        {ourRoomSelected ? (
          <label className="same-space-room-pets">
            <input
              type="checkbox"
              checked={includePets}
              disabled={preparingOurRoom || ourRoomDisabled}
              onChange={(event) => onIncludePetsChange?.(event.target.checked)}
            />
            <span>{t('우리 반려동물 포함')}</span>
          </label>
        ) : null}
        {rows.map((preset) => {
          const selected = preset.key === selectedKey;
          return (
            <button
              key={preset.key}
              type="button"
              role="listitem"
              className={`same-space-bg-thumb${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
              onClick={() => onSelect(preset.key)}
            >
              <span
                className="same-space-bg-thumb-swatch"
                style={thumbs[preset.key] ? { backgroundImage: `url(${thumbs[preset.key]})` } : {
                  background: `linear-gradient(135deg, ${preset.fallbackGradient.from}, ${preset.fallbackGradient.to})`,
                }}
              />
              <span className="same-space-bg-thumb-label">{preset.shortLabel}</span>
              {selected ? <span className="same-space-bg-thumb-check" aria-hidden>✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
