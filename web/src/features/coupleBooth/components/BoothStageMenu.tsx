import { useEffect, useId, useRef, useState } from 'react';
import { LOCALES, useI18n } from '../../../lib/i18n';

type Props = {
  onLeave?: () => void;
  onSignOut?: () => void;
  showSignOut?: boolean;
};

export function BoothStageMenu({ onLeave, onSignOut, showSignOut = true }: Props) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="booth-stage-menu" ref={rootRef}>
      <button
        type="button"
        className="booth-stage-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {t('설정')}
      </button>
      {open ? (
        <div className="booth-stage-menu-panel" id={menuId} role="menu">
          {onLeave ? (
            <button
              type="button"
              role="menuitem"
              className="booth-stage-menu-item"
              onClick={() => {
                setOpen(false);
                onLeave();
              }}
            >
              {t('나가기')}
            </button>
          ) : null}
          {showSignOut && onSignOut ? (
            <button
              type="button"
              role="menuitem"
              className="booth-stage-menu-item booth-stage-menu-item-muted"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              {t('로그아웃')}
            </button>
          ) : null}
          <label className="booth-stage-menu-language">
            <span>{t('언어')}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}>
              {LOCALES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
