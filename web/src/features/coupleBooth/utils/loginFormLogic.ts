import { LOGIN_COPY, type LoginBusyMethod, type LoginFormMode } from './loginCopy';

export type EmailPasswordValidation = {
  emailError: string | null;
  passwordError: string | null;
  ok: boolean;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmailPassword(email: string, password: string, mode: LoginFormMode): EmailPasswordValidation {
  const trimmed = email.trim();
  let emailError: string | null = null;
  let passwordError: string | null = null;

  if (!trimmed) {
    emailError = LOGIN_COPY.emailRequired;
  } else if (!EMAIL_PATTERN.test(trimmed)) {
    emailError = LOGIN_COPY.emailInvalid;
  }

  if (!password) {
    passwordError = LOGIN_COPY.passwordRequired;
  } else if (mode === 'signup' && password.length < 6) {
    passwordError = LOGIN_COPY.passwordTooShort;
  }

  return {
    emailError,
    passwordError,
    ok: !emailError && !passwordError,
  };
}

export function isLoginBusy(busy: LoginBusyMethod): boolean {
  return busy !== 'idle';
}

/** Only the active method reports loading; others stay idle for independent UI. */
export function isMethodLoading(busy: LoginBusyMethod, method: Exclude<LoginBusyMethod, 'idle'>): boolean {
  return busy === method;
}

export function canStartAuth(busy: LoginBusyMethod): boolean {
  return busy === 'idle';
}

export function resolveEmailSubmitAction(mode: LoginFormMode): 'signInWithPassword' | 'signUpWithPassword' {
  return mode === 'signup' ? 'signUpWithPassword' : 'signInWithPassword';
}

/** Magic-link path must never be selected from the login screen. */
export function resolveLoginSubmitPath(mode: LoginFormMode): 'password' | 'signup' {
  return mode === 'signup' ? 'signup' : 'password';
}

export function primaryButtonLabel(mode: LoginFormMode, loading: boolean): string {
  if (mode === 'signup') {
    return loading ? LOGIN_COPY.signUpLoading : LOGIN_COPY.signUp;
  }
  return loading ? LOGIN_COPY.signInLoading : LOGIN_COPY.signIn;
}

export function togglePasswordVisible(current: boolean): boolean {
  return !current;
}
