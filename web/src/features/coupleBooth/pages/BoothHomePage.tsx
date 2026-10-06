import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isValidBoothSessionId } from '@shared/entry';
import { useAuth } from '../../../lib/auth';
import {
  getMyActiveBoothSession,
  getOrCreateBoothSession,
  notifyBoothInvite,
  respondBoothSession,
  subscribeCoupleBoothSessions,
} from '../api';
import type { BoothSession } from '@shared/types';
import { resolveBoothLobbyView } from '@shared/lobby';
import { BoothStageMenu } from '../components/BoothStageMenu';
import { useI18n } from '../../../lib/i18n';

/**
 * Couple Booth lobby. Authentication only establishes identity; this page
 * does not create or enter a Booth until the user explicitly chooses it.
 */
export function BoothHomePage() {
  const { t } = useI18n();
  const { user, profile, loading, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeSession, setActiveSession] = useState<BoothSession | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [action, setAction] = useState<'idle' | 'create' | 'enter'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [needsCouple, setNeedsCouple] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (loading || !user?.id) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const loadLobby = async () => {
      setLoadingRoom(true);
      setError(null);
      setNeedsCouple(false);
      try {
        const currentProfile = profile?.coupleId ? profile : await refreshProfile();
        if (!currentProfile?.coupleId) {
          if (!cancelled) {
            setNeedsCouple(true);
            setActiveSession(null);
          }
          return;
        }

        const refresh = async () => {
          const next = await getMyActiveBoothSession();
          if (!cancelled) setActiveSession(next);
        };
        await refresh();
        unsubscribe = await subscribeCoupleBoothSessions(currentProfile.coupleId, () => {
          void refresh().catch(() => undefined);
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('촬영방 상태를 불러오지 못했습니다.'));
        }
      } finally {
        if (!cancelled) setLoadingRoom(false);
      }
    };

    void loadLobby();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [loading, profile, refreshProfile, retryToken, user?.id]);

  const goToSession = useCallback(async (session: BoothSession) => {
    if (!user?.id || !isValidBoothSessionId(session.id)) return;
    setAction('enter');
    setError(null);
    try {
      let next = session;
      if (session.guestUserId === user.id && session.status === 'invited') {
        next = await respondBoothSession(session.id, true);
      }
      navigate(`/booth/${next.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('촬영방에 들어가지 못했습니다.'));
      setAction('idle');
    }
  }, [navigate, user?.id]);

  const createRoom = useCallback(async () => {
    if (!user?.id || action !== 'idle') return;
    setAction('create');
    setError(null);
    try {
      // The existing RPC is atomic per couple. If the partner wins the race,
      // it returns that same active session instead of creating a second one.
      let next = await getOrCreateBoothSession();
      if (next.guestUserId === user.id && next.status === 'invited') {
        next = await respondBoothSession(next.id, true);
      }
      if (next.hostUserId === user.id) {
        void notifyBoothInvite(next.id).catch(() => undefined);
      }
      navigate(`/booth/${next.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('촬영방을 만들지 못했습니다.'));
      setAction('idle');
    }
  }, [action, navigate, user?.id]);

  const handleSignOut = useCallback(() => {
    if (signingOut) return;
    setSigningOut(true);
    void signOut()
      .then(() => navigate('/login', { replace: true }))
      .catch((err) => {
        setSigningOut(false);
        setError(err instanceof Error ? err.message : t('로그아웃하지 못했습니다.'));
      });
  }, [navigate, signOut, signingOut]);

  if (loading) {
    return <BoothEntryLoading />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: '/booth' }} />;
  }

  if (needsCouple) {
    return (
      <div className="booth-entry-shell" role="status">
        <p className="booth-entry-mark">jongjong</p>
        <p className="booth-entry-title">{t('파트너 연결이 필요해요')}</p>
        <p className="booth-entry-detail">
          {t('앱에서 파트너와 먼저 연결한 뒤, 같은 계정으로 웹에 로그인해 주세요.')}
        </p>
        <button
          type="button"
          className="btn btn-secondary booth-entry-retry"
          onClick={() => {
            setRetryToken((value) => value + 1);
          }}
        >
          {t('다시 시도')}
        </button>
      </div>
    );
  }

  if (loadingRoom) {
    return <BoothEntryLoading />;
  }

  if (error) {
    return (
      <div className="booth-entry-shell" role="alert">
        <p className="booth-entry-mark">jongjong</p>
        <p className="booth-entry-title">{t('촬영 준비에 실패했어요')}</p>
        <p className="booth-entry-detail">{error}</p>
        <button
          type="button"
          className="btn btn-secondary booth-entry-retry"
          onClick={() => {
            setRetryToken((value) => value + 1);
          }}
        >
          {t('다시 시도')}
        </button>
      </div>
    );
  }

  if (activeSession) {
    const lobbyView = resolveBoothLobbyView(activeSession, user.id);
    const isPendingInvite = lobbyView === 'guest_invite';
    return (
      <div className="booth-lobby-shell" role="status">
        <header className="booth-lobby-top">
          <p className="booth-entry-mark">jongjong</p>
          <BoothStageMenu
            onSignOut={handleSignOut}
            showSignOut={!signingOut}
          />
        </header>
        <main className="booth-lobby-card">
          <p className="booth-lobby-eyebrow">{isPendingInvite ? t('새로운 초대') : 'Couple Booth'}</p>
          <h1 className="booth-entry-title">
            {isPendingInvite ? t('상대가 같이 사진을 찍고 싶어해요 💌') : t('촬영방이 준비되어 있어요')}
          </h1>
          <p className="booth-entry-detail">
            {isPendingInvite ? '초대를 확인하고 방에 들어가 함께 촬영해 보세요.' : '상대를 기다리고 있거나 이어서 촬영할 수 있어요.'}
          </p>
          <button
            type="button"
            className="btn btn-primary booth-lobby-cta"
            disabled={action !== 'idle' || signingOut}
            onClick={() => void goToSession(activeSession)}
          >
            {action === 'enter' ? t('방을 여는 중…') : isPendingInvite ? t('방 들어가기') : t('방으로 돌아가기')}
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="booth-lobby-shell" role="main">
      <header className="booth-lobby-top">
        <p className="booth-entry-mark">jongjong</p>
        <BoothStageMenu
          onSignOut={handleSignOut}
          showSignOut={!signingOut}
        />
      </header>
      <main className="booth-lobby-card">
        <p className="booth-lobby-eyebrow">Couple Booth</p>
        <h1 className="booth-entry-title">{t('같이 사진 찍을까요? ♡')}</h1>
        <p className="booth-lobby-lead">{t('멀리 있어도,')}<br />{t('같은 순간을 함께 남겨요.')}</p>
        <button
          type="button"
          className="btn btn-primary booth-lobby-cta"
          disabled={action !== 'idle' || signingOut}
          onClick={() => void createRoom()}
        >
          {action === 'create' ? t('방을 만드는 중…') : t('방 만들기')}
        </button>
        <p className="booth-lobby-footnote">{t('방을 만들면 상대에게 바로 초대돼요.')}</p>
      </main>
    </div>
  );
}

function BoothEntryLoading() {
  const { t } = useI18n();
  return (
    <div className="booth-entry-shell" aria-busy="true" aria-live="polite">
      <p className="booth-entry-mark">jongjong</p>
      <p className="booth-entry-title">{t('촬영 준비 중…')}</p>
      <div className="booth-entry-spinner" aria-hidden="true" />
    </div>
  );
}
