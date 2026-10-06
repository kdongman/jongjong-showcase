import { useCallback, useEffect, useState } from 'react';
import {
  createBoothGuestLink,
  listBoothGuestLinks,
  revokeBoothGuestLink,
  type BoothGuestLinkInfo,
} from '../api';

type Props = {
  sessionId: string;
  enabled: boolean;
};

/** Internal-tester-only controls. Server still enforces is_internal_tester. */
export function BoothGuestLinkPanel({ sessionId, enabled }: Props) {
  const [links, setLinks] = useState<BoothGuestLinkInfo[]>([]);
  const [latestUrl, setLatestUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !sessionId) return;
    try {
      setLinks(await listBoothGuestLinks(sessionId));
    } catch {
      /* table may not exist until migration is applied */
    }
  }, [enabled, sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!enabled) return null;

  const create = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const link = await createBoothGuestLink(sessionId);
      setLatestUrl(link.url);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '링크를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (linkId: string) => {
    setBusy(true);
    setError(null);
    try {
      await revokeBoothGuestLink(linkId);
      if (latestUrl) setLatestUrl(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '링크를 폐기하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!latestUrl) return;
    try {
      await navigator.clipboard.writeText(latestUrl);
      setCopied(true);
    } catch {
      setError('클립보드에 복사하지 못했습니다.');
    }
  };

  const openLink = links.find((link) => !link.revokedAt && link.useCount === 0)
    ?? links[0]
    ?? null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>테스트용 게스트 링크</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        친구가 로그인 없이 이 촬영방에 한 번 입장할 수 있는 10분·1회용 링크입니다.
      </p>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void create()}>
        {busy ? '만드는 중…' : '테스트용 게스트 링크 만들기'}
      </button>
      {latestUrl ? (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ wordBreak: 'break-all' }}>{latestUrl}</p>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => void copy()}>
              {copied ? '복사됨' : '링크 복사'}
            </button>
          </div>
        </div>
      ) : null}
      {openLink ? (
        <p className="muted" style={{ marginTop: 12 }}>
          만료: {new Date(openLink.expiresAt).toLocaleString()}
          {' · '}
          {openLink.revokedAt
            ? '폐기됨'
            : openLink.useCount >= openLink.maxUses || openLink.claimedAt
              ? '사용됨'
              : '아직 사용되지 않음'}
          {!openLink.revokedAt ? (
            <>
              {' · '}
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void revoke(openLink.id)}>
                링크 폐기
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? <p className="error-text" style={{ marginTop: 8 }}>{error}</p> : null}
    </div>
  );
}
