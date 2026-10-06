import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { safeBoothReturnPath, useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { AppleLogoIcon } from '../components/icons/AppleLogoIcon';
import { GoogleLogoIcon } from '../components/icons/GoogleLogoIcon';
import { runEmailPasswordAuth, runOAuthAuth } from '../utils/loginAuthActions';
import { LOGIN_COPY, type LoginBusyMethod, type LoginFormMode } from '../utils/loginCopy';
import {
  isLoginBusy,
  isMethodLoading,
  primaryButtonLabel,
} from '../utils/loginFormLogic';

export function LoginPage() {
  const { t } = useI18n();
  const {
    user,
    loading,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
    signInWithApple,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedReturnTo = safeBoothReturnPath(
    (location.state as { from?: string } | null)?.from || sessionStorage.getItem('booth_return_to'),
  );
  // Authentication should land in the lobby. A direct session URL is an
  // intent to enter a Booth, not permission to skip the lobby confirmation.
  const returnTo = requestedReturnTo.startsWith('/booth/') ? '/booth' : requestedReturnTo;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formMode, setFormMode] = useState<LoginFormMode>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusyState] = useState<LoginBusyMethod>('idle');
  const busyRef = useRef<LoginBusyMethod>('idle');
  const setBusy = (next: LoginBusyMethod) => {
    busyRef.current = next;
    setBusyState(next);
  };
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  if (!loading && user) {
    return <Navigate to={returnTo} replace />;
  }

  const authBusy = isLoginBusy(busy);
  const handlers = {
    signInWithPassword,
    signUpWithPassword,
    signInWithApple,
    signInWithGoogle,
  };

  const clearFormErrors = () => {
    setError(null);
    setMessage(null);
    setEmailError(null);
    setPasswordError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setEmailError(null);
    setPasswordError(null);
    sessionStorage.setItem('booth_return_to', returnTo);

    const result = await runEmailPasswordAuth({
      busy: busyRef.current,
      mode: formMode,
      email,
      password,
      handlers,
      onBusy: setBusy,
      signupSuccessMessage: t(LOGIN_COPY.signupSuccess),
    });

    if (!result.ok) {
      if (result.kind === 'validation') {
        setEmailError(result.emailError ? t(result.emailError) : null);
        setPasswordError(result.passwordError ? t(result.passwordError) : null);
      } else if (result.kind === 'authError') {
        setError(result.error ?? null);
      }
      return;
    }

    if (result.kind === 'signedUp') {
      setMessage(result.message ? t(result.message) : t(LOGIN_COPY.signupSuccess));
      return;
    }

    if (result.kind === 'signedIn') {
      navigate(returnTo, { replace: true });
    }
  };

  const onGoogle = async () => {
    clearFormErrors();
    sessionStorage.setItem('booth_return_to', returnTo);
    const result = await runOAuthAuth({
      busy: busyRef.current,
      provider: 'google',
      handlers,
      onBusy: setBusy,
    });
    if (!result.ok && result.kind === 'authError') {
      setError(result.error ?? null);
    }
  };

  const onApple = async () => {
    clearFormErrors();
    sessionStorage.setItem('booth_return_to', returnTo);
    const result = await runOAuthAuth({
      busy: busyRef.current,
      provider: 'apple',
      handlers,
      onBusy: setBusy,
    });
    if (!result.ok && result.kind === 'authError') {
      setError(result.error ?? null);
    }
  };

  const switchMode = (next: LoginFormMode) => {
    if (authBusy) return;
    setFormMode(next);
    clearFormErrors();
  };

  const appleLoading = isMethodLoading(busy, 'apple');
  const googleLoading = isMethodLoading(busy, 'google');
  const emailLoading = isMethodLoading(busy, 'email');

  return (
    <div className="login-page">
      <div className="login-card card">
        <p className="brand login-brand">{t(LOGIN_COPY.brand)}</p>
        <h1 className="login-title">{t(LOGIN_COPY.title)}</h1>
        <p className="login-lead muted">{t(LOGIN_COPY.description)}</p>

        {error ? (
          <p className="login-alert error-text" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="login-alert login-success" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}

        <div className="login-oauth">
          <button
            type="button"
            className="btn-oauth btn-oauth-apple"
            disabled={authBusy}
            aria-busy={appleLoading}
            onClick={() => void onApple()}
          >
            <span className="btn-oauth-icon" aria-hidden="true">
              {appleLoading ? <span className="login-spinner" /> : <AppleLogoIcon />}
            </span>
            <span className="btn-oauth-label">
              {appleLoading ? t(LOGIN_COPY.appleLoading) : t(LOGIN_COPY.apple)}
            </span>
            <span className="btn-oauth-spacer" aria-hidden="true" />
          </button>

          <button
            type="button"
            className="btn-oauth btn-oauth-google"
            disabled={authBusy}
            aria-busy={googleLoading}
            onClick={() => void onGoogle()}
          >
            <span className="btn-oauth-icon" aria-hidden="true">
              {googleLoading ? <span className="login-spinner login-spinner-dark" /> : <GoogleLogoIcon />}
            </span>
            <span className="btn-oauth-label">
              {googleLoading ? t(LOGIN_COPY.googleLoading) : t(LOGIN_COPY.google)}
            </span>
            <span className="btn-oauth-spacer" aria-hidden="true" />
          </button>
        </div>

        <div className="login-divider" role="separator" aria-label={t(LOGIN_COPY.divider)}>
          <span>{t(LOGIN_COPY.divider)}</span>
        </div>

        <form className="login-form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <div className="field login-field">
            <label htmlFor="login-email">{t(LOGIN_COPY.email)}</label>
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              disabled={authBusy}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? 'login-email-error' : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
                if (error) setError(null);
              }}
            />
            {emailError ? (
              <p id="login-email-error" className="field-error" role="alert">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="field login-field">
            <label htmlFor="login-password">{t(LOGIN_COPY.password)}</label>
            <div className="login-password-wrap">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={formMode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                disabled={authBusy}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? 'login-password-error' : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                  if (error) setError(null);
                }}
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={showPassword ? t(LOGIN_COPY.hidePassword) : t(LOGIN_COPY.showPassword)}
                aria-pressed={showPassword}
                disabled={authBusy}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {passwordError ? (
              <p id="login-password-error" className="field-error" role="alert">
                {passwordError}
              </p>
            ) : null}
          </div>

          <button
            className="btn btn-primary login-submit"
            type="submit"
            disabled={authBusy}
            aria-busy={emailLoading}
          >
            {emailLoading ? <span className="login-spinner" /> : null}
            {t(primaryButtonLabel(formMode, emailLoading))}
          </button>
        </form>

        <p className="login-switch">
          {formMode === 'signin' ? (
            <>
              {t(LOGIN_COPY.createAccountPrompt)}{' '}
              <button
                type="button"
                className="login-text-link"
                disabled={authBusy}
                onClick={() => switchMode('signup')}
              >
                {t(LOGIN_COPY.createAccountAction)}
              </button>
            </>
          ) : (
            <>
              {t(LOGIN_COPY.backToSignInPrompt)}{' '}
              <button
                type="button"
                className="login-text-link"
                disabled={authBusy}
                onClick={() => switchMode('signin')}
              >
                {t(LOGIN_COPY.backToSignInAction)}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M3 3l18 18M10.5 6.4A9.4 9.4 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16.6 16.6 0 01-3.2 3.7M7.1 7.1A16 16 0 002.5 12S6 18.5 12 18.5c1.4 0 2.7-.3 3.9-.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M9.9 9.9a3.2 3.2 0 004.2 4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
