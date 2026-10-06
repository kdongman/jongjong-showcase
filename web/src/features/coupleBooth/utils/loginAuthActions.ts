import type { LoginBusyMethod, LoginFormMode } from './loginCopy';
import { canStartAuth, resolveEmailSubmitAction, validateEmailPassword } from './loginFormLogic';
import { formatLoginAuthError } from './loginAuthErrors';

export type LoginAuthHandlers = {
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
};

export type LoginAuthActionResult =
  | { ok: true; kind: 'signedIn' | 'signedUp' | 'oauthStarted'; message?: string }
  | {
      ok: false;
      kind: 'validation' | 'authError' | 'blocked';
      error?: string;
      emailError?: string | null;
      passwordError?: string | null;
    };

/**
 * Email/password sign-in or sign-up. Magic-link / OTP is intentionally unsupported.
 */
export async function runEmailPasswordAuth(params: {
  busy: LoginBusyMethod;
  mode: LoginFormMode;
  email: string;
  password: string;
  handlers: Pick<LoginAuthHandlers, 'signInWithPassword' | 'signUpWithPassword'>;
  onBusy: (next: LoginBusyMethod) => void;
  signupSuccessMessage: string;
}): Promise<LoginAuthActionResult> {
  if (!canStartAuth(params.busy)) {
    return { ok: false, kind: 'blocked' };
  }

  // Lock before await points so duplicate Enter/submit cannot race.
  params.onBusy('email');
  try {
    const validation = validateEmailPassword(params.email, params.password, params.mode);
    if (!validation.ok) {
      return {
        ok: false,
        kind: 'validation',
        emailError: validation.emailError,
        passwordError: validation.passwordError,
      };
    }

    const action = resolveEmailSubmitAction(params.mode);
    if (action === 'signUpWithPassword') {
      await params.handlers.signUpWithPassword(params.email.trim(), params.password);
      return { ok: true, kind: 'signedUp', message: params.signupSuccessMessage };
    }
    await params.handlers.signInWithPassword(params.email.trim(), params.password);
    return { ok: true, kind: 'signedIn' };
  } catch (err) {
    return {
      ok: false,
      kind: 'authError',
      error: formatLoginAuthError(err, params.mode === 'signup' ? 'signup' : 'signin'),
    };
  } finally {
    params.onBusy('idle');
  }
}

export async function runOAuthAuth(params: {
  busy: LoginBusyMethod;
  provider: 'apple' | 'google';
  handlers: Pick<LoginAuthHandlers, 'signInWithApple' | 'signInWithGoogle'>;
  onBusy: (next: LoginBusyMethod) => void;
}): Promise<LoginAuthActionResult> {
  if (!canStartAuth(params.busy)) {
    return { ok: false, kind: 'blocked' };
  }

  params.onBusy(params.provider);
  try {
    if (params.provider === 'apple') {
      await params.handlers.signInWithApple();
    } else {
      await params.handlers.signInWithGoogle();
    }
    return { ok: true, kind: 'oauthStarted' };
  } catch (err) {
    return {
      ok: false,
      kind: 'authError',
      error: formatLoginAuthError(err, 'oauth'),
    };
  } finally {
    params.onBusy('idle');
  }
}
