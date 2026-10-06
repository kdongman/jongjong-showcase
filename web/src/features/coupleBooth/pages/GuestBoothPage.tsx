import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useI18n } from '../../../lib/i18n';
import { redeemBoothGuestLink } from '../api';

export function GuestBoothDonePage() {
  const { t } = useI18n();
  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <p className="brand">JONGJONG</p>
      <h1 style={{ marginTop: 8 }}>{t('테스트 촬영 종료')}</h1>
      <p className="muted">{t('촬영실에서 나갔습니다. 이 창을 닫아도 됩니다.')}</p>
    </div>
  );
}

export function GuestBoothPage() {
  const { t } = useI18n();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token || token.length < 20) {
        setError(t('링크가 유효하지 않거나 이미 사용되었습니다.'));
        return;
      }
      try {
        const redeemed = await redeemBoothGuestLink(token);
        if (cancelled) return;
        sessionStorage.setItem(`booth_guest_livekit:${redeemed.sessionId}`, JSON.stringify(redeemed.livekit));
        sessionStorage.setItem(`booth_guest_mode:${redeemed.sessionId}`, '1');
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: redeemed.accessToken,
          refresh_token: redeemed.refreshToken,
        });
        if (sessionError) throw sessionError;
        navigate(`/booth/${redeemed.sessionId}`, { replace: true });
      } catch {
        if (!cancelled) setError(t('링크가 유효하지 않거나 이미 사용되었습니다.'));
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [navigate, t, token]);

  return (
    <div className="app-shell" style={{ maxWidth: 480 }}>
      <p className="brand">JONGJONG</p>
      <h1 style={{ marginTop: 8 }}>{t('테스트 촬영방')}</h1>
      {error ? <p className="error-text">{error}</p> : <p className="muted" role="status">{t('테스트 촬영방에 연결하는 중…')}</p>}
    </div>
  );
}
