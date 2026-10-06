import { useEffect, useRef, useState } from 'react';
import { classifyMediaError, type BoothMediaErrorCode } from '../media/mediaConnectionState';

type WaitingPreviewState = 'idle' | 'requesting' | 'ready' | BoothMediaErrorCode;

/**
 * Local-only camera preview while the booth session is still `invited`
 * (LiveKit tokens are not issued until accepted). Single-flight + cleanup
 * protect against StrictMode double mounts.
 */
export function useWaitingLocalPreview(enabled: boolean, retryNonce = 0) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const attemptRef = useRef(0);
  const [previewState, setPreviewState] = useState<WaitingPreviewState>('idle');
  const [errorCode, setErrorCode] = useState<BoothMediaErrorCode | null>(null);

  useEffect(() => {
    if (!enabled) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setPreviewState('idle');
      setErrorCode(null);
      return;
    }

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setPreviewState('unsupported');
      setErrorCode('unsupported');
      return;
    }

    const attempt = ++attemptRef.current;
    let cancelled = false;
    setPreviewState('requesting');
    setErrorCode(null);

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled || attempt !== attemptRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          void el.play().catch(() => undefined);
        }
        setPreviewState('ready');
      } catch (cause) {
        if (cancelled || attempt !== attemptRef.current) return;
        const code = classifyMediaError(cause);
        setErrorCode(code);
        setPreviewState(code);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [enabled, retryNonce]);

  useEffect(() => {
    const el = videoRef.current;
    const stream = streamRef.current;
    if (!el || !stream || previewState !== 'ready') return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    }
  }, [previewState]);

  return {
    videoRef,
    previewState,
    errorCode,
    ready: previewState === 'ready',
  };
}
