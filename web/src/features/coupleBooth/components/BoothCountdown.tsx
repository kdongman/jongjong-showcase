import { useI18n } from '../../../lib/i18n';

type Props = {
  value: number | null;
  flash: boolean;
};

export function BoothCountdown({ value, flash }: Props) {
  const { t } = useI18n();
  return (
    <>
      {value != null ? (
        <div className="countdown-overlay">
          <div className={value > 0 ? 'countdown-value' : 'countdown-label'}>{value > 0 ? value : t('촬영')}</div>
        </div>
      ) : null}
      {flash ? <div className="flash" /> : null}
    </>
  );
}
