import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useI18n } from '../../../lib/i18n';

type Props = {
  open: boolean;
  title: string;
  imageUrl?: string;
  sameSpacePreview?: ReactNode;
  orderLabel?: number | null;
  selectable: boolean;
  selected: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleSelect: () => void;
};

export function ShotLightbox({
  open,
  title,
  imageUrl,
  sameSpacePreview,
  orderLabel,
  selectable,
  selected,
  canGoPrev,
  canGoNext,
  onClose,
  onPrev,
  onNext,
  onToggleSelect,
}: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && canGoPrev) onPrev();
      if (event.key === 'ArrowRight' && canGoNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onPrev, onNext, canGoPrev, canGoNext]);

  if (!open) return null;

  return (
    <div className="booth-lightbox" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="booth-lightbox-backdrop" aria-label={t('닫기')} onClick={onClose} />
      <div className="booth-lightbox-panel">
        <div className="booth-lightbox-toolbar">
          <h3 id={titleId}>{title}</h3>
          <div className="row" style={{ gap: 8 }}>
            {orderLabel ? <span className="booth-lightbox-order">{t('선택')} {orderLabel}</span> : null}
            <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
              {t('닫기')}
            </button>
          </div>
        </div>
        <div className="booth-lightbox-stage">
          {sameSpacePreview ?? (
            imageUrl
              ? <img src={imageUrl} alt={title} className="booth-lightbox-image" />
              : <div className="shot-placeholder booth-lightbox-placeholder">{t('이미지를 불러오는 중')}</div>
          )}
        </div>
        <div className="booth-lightbox-actions row" style={{ justifyContent: 'space-between', gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost" disabled={!canGoPrev} onClick={onPrev}>
              {t('이전')}
            </button>
            <button type="button" className="btn btn-ghost" disabled={!canGoNext} onClick={onNext}>
              {t('다음')}
            </button>
          </div>
          {selectable ? (
            <button type="button" className="btn btn-primary" onClick={onToggleSelect}>
              {selected ? t('선택 해제') : t('이 사진 선택')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
