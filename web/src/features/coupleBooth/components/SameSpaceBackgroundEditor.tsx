import { useRef, useState } from 'react';
import {
  SAME_SPACE_COLOR_PRESETS,
  SAME_SPACE_IMAGE_PRESETS,
  normalizeHexColor,
  type SameSpaceBackground,
} from '@shared/sameSpaceBackground';
import type { SameSpaceFrontPreference, SameSpaceSoloLayout } from '@shared/sameSpaceLayoutSpec';
import { useI18n } from '../../../lib/i18n';

type Tab = 'color' | 'image' | 'original';

type Props = {
  background: SameSpaceBackground;
  frontSlot: SameSpaceFrontPreference;
  soloLayout: SameSpaceSoloLayout;
  disabled?: boolean;
  onBackgroundChange: (next: SameSpaceBackground) => void;
  onFrontSlotChange: (next: SameSpaceFrontPreference) => void;
  onSoloLayoutChange: (next: SameSpaceSoloLayout) => void;
  onCustomImage: (file: File) => Promise<SameSpaceBackground | null>;
};

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export function SameSpaceBackgroundEditor({
  background,
  frontSlot,
  soloLayout,
  disabled,
  onBackgroundChange,
  onFrontSlotChange,
  onSoloLayoutChange,
  onCustomImage,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(
    background.type === 'image' || background.type === 'gradient'
      ? 'image'
      : background.type === 'original'
        ? 'original'
        : 'color',
  );
  const [customHex, setCustomHex] = useState(
    background.type === 'solid' ? background.color : '#F7F2FA',
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedColor = background.type === 'solid' ? background.color : null;

  return (
    <section className="same-space-bg-editor" aria-label={t('배경 편집')}>
      <strong>{t('배경')}</strong>
      <div className="same-space-bg-tabs" role="tablist">
        {([
          ['color', t('색상')],
          ['image', t('이미지')],
          ['original', t('원본')],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'btn btn-primary' : 'btn btn-secondary'}
            disabled={disabled}
            onClick={() => {
              setTab(id);
              if (id === 'original') onBackgroundChange({ type: 'original' });
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'color' ? (
        <div className="same-space-bg-swatches">
          {SAME_SPACE_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`same-space-bg-swatch${selectedColor === preset.color ? ' selected' : ''}`}
              style={{ background: preset.color }}
              disabled={disabled}
              aria-label={preset.label}
              title={preset.label}
              onClick={() => onBackgroundChange({ type: 'solid', color: preset.color })}
            />
          ))}
          <label className="same-space-bg-custom">
            직접 선택
            <input
              type="color"
              disabled={disabled}
              value={normalizeHexColor(customHex)}
              onChange={(event) => {
                const color = normalizeHexColor(event.target.value);
                setCustomHex(color);
                onBackgroundChange({ type: 'solid', color });
              }}
            />
          </label>
        </div>
      ) : null}

      {tab === 'image' ? (
        <div className="same-space-bg-images">
          {SAME_SPACE_IMAGE_PRESETS.map((preset) => {
            const active = background.type === 'gradient'
              && background.from === preset.background.from
              && background.to === preset.background.to;
            return (
              <button
                key={preset.id}
                type="button"
                className={`same-space-bg-image-preset${active ? ' selected' : ''}`}
                disabled={disabled}
                style={{
                  background: `linear-gradient(${preset.background.angleDeg ?? 135}deg, ${preset.background.from}, ${preset.background.to})`,
                }}
                onClick={() => onBackgroundChange(preset.background)}
              >
                {preset.label}
              </button>
            );
          })}
          <div className="same-space-bg-upload">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void (async () => {
                  setUploadError(null);
                  if (!ALLOWED_TYPES.has(file.type)) {
                    setUploadError('jpg, png, webp만 올릴 수 있어요.');
                    return;
                  }
                  if (file.size > MAX_UPLOAD_BYTES) {
                    setUploadError('이미지가 너무 커요. 8MB 이하로 올려 주세요.');
                    return;
                  }
                  setUploading(true);
                  try {
                    // Decode check before trusting MIME.
                    const bitmap = await createImageBitmap(file);
                    bitmap.close();
                    const next = await onCustomImage(file);
                    if (!next) setUploadError('배경 이미지 업로드에 실패했어요.');
                    else onBackgroundChange(next);
                  } catch {
                    setUploadError('이 이미지는 열 수 없어요.');
                  } finally {
                    setUploading(false);
                  }
                })();
              }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? '올리는 중…' : '내 이미지 올리기'}
            </button>
            {uploadError ? <p className="error-text">{uploadError}</p> : null}
          </div>
        </div>
      ) : null}

      {tab === 'original' ? (
        <p className="muted">누끼 없이 원본 배경을 쓰는 대신, 합성 장면은 기본 배경을 유지해요.</p>
      ) : null}

      <div className="same-space-bg-layer-controls">
        <label>
          겹칠 때 앞쪽
          <select
            disabled={disabled}
            value={frontSlot}
            onChange={(event) => onFrontSlotChange(event.target.value as SameSpaceFrontPreference)}
          >
            <option value="left">왼쪽 인물</option>
            <option value="right">오른쪽 인물</option>
          </select>
        </label>
        <label>
          혼자일 때 구도
          <select
            disabled={disabled}
            value={soloLayout}
            onChange={(event) => onSoloLayoutChange(event.target.value as SameSpaceSoloLayout)}
          >
            <option value="half">내 절반 유지</option>
            <option value="center">중앙 배치</option>
          </select>
        </label>
      </div>
    </section>
  );
}
