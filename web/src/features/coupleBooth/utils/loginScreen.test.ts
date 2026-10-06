import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEmailPasswordAuth, runOAuthAuth } from './loginAuthActions';
import { formatLoginAuthError, uiContainsAuthSecrets } from './loginAuthErrors';
import { LOGIN_AUTH_METHODS, LOGIN_COPY } from './loginCopy';
import {
  canStartAuth,
  isMethodLoading,
  primaryButtonLabel,
  resolveEmailSubmitAction,
  resolveLoginSubmitPath,
  togglePasswordVisible,
  validateEmailPassword,
} from './loginFormLogic';

const here = dirname(fileURLToPath(import.meta.url));
const loginPageSource = readFileSync(join(here, '../pages/LoginPage.tsx'), 'utf8');
const authSource = readFileSync(join(here, '../../../lib/auth.tsx'), 'utf8');
const loginCss = readFileSync(join(here, '../../../index.css'), 'utf8');

describe('Couple Booth login screen — Magic Link removed', () => {
  it('does not render a Magic Link tab or copy', () => {
    assert.equal(loginPageSource.includes('Magic Link'), false);
    assert.equal(loginPageSource.includes('magic'), false);
    assert.equal(loginPageSource.includes('signInWithMagicLink'), false);
    assert.equal(loginPageSource.includes('signInWithOtp'), false);
    assert.equal(Object.values(LOGIN_COPY).some((v) => /magic/i.test(v)), false);
    assert.deepEqual([...LOGIN_AUTH_METHODS], ['apple', 'google', 'email']);
  });

  it('never routes email submit through a magic-link path', () => {
    assert.equal(resolveLoginSubmitPath('signin'), 'password');
    assert.equal(resolveLoginSubmitPath('signup'), 'signup');
    assert.equal(resolveEmailSubmitAction('signin'), 'signInWithPassword');
    assert.equal(resolveEmailSubmitAction('signup'), 'signUpWithPassword');
  });

  it('removes magic-link OTP from AuthProvider while keeping OAuth/password', () => {
    assert.equal(authSource.includes('signInWithMagicLink'), false);
    assert.equal(authSource.includes('signInWithOtp'), false);
    assert.match(authSource, /signInWithPassword/);
    assert.match(authSource, /signUpWithPassword/);
    assert.match(authSource, /signInWithGoogle/);
    assert.match(authSource, /signInWithApple/);
    assert.match(authSource, /emailRedirectTo|redirectTo/);
    assert.match(authSource, /provider: 'google'/);
    assert.match(authSource, /provider: 'apple'/);
  });
});

describe('Couple Booth login screen — auth handlers', () => {
  it('calls Apple OAuth handler on Apple action', async () => {
    const signInWithApple = mock.fn(async () => undefined);
    const signInWithGoogle = mock.fn(async () => undefined);
    let busy: 'idle' | 'apple' | 'google' | 'email' = 'idle';

    const result = await runOAuthAuth({
      busy,
      provider: 'apple',
      handlers: { signInWithApple, signInWithGoogle },
      onBusy: (next) => {
        busy = next;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(signInWithApple.mock.callCount(), 1);
    assert.equal(signInWithGoogle.mock.callCount(), 0);
    assert.equal(busy, 'idle');
  });

  it('calls Google OAuth handler on Google action', async () => {
    const signInWithApple = mock.fn(async () => undefined);
    const signInWithGoogle = mock.fn(async () => undefined);

    const result = await runOAuthAuth({
      busy: 'idle',
      provider: 'google',
      handlers: { signInWithApple, signInWithGoogle },
      onBusy: () => undefined,
    });

    assert.equal(result.ok, true);
    assert.equal(signInWithGoogle.mock.callCount(), 1);
    assert.equal(signInWithApple.mock.callCount(), 0);
  });

  it('submits email/password sign-in through the password handler', async () => {
    const signInWithPassword = mock.fn(async () => undefined);
    const signUpWithPassword = mock.fn(async () => undefined);

    const result = await runEmailPasswordAuth({
      busy: 'idle',
      mode: 'signin',
      email: 'ada@example.com',
      password: 'secret-pass',
      handlers: { signInWithPassword, signUpWithPassword },
      onBusy: () => undefined,
      signupSuccessMessage: LOGIN_COPY.signupSuccess,
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.kind, 'signedIn');
    assert.equal(signInWithPassword.mock.callCount(), 1);
    assert.deepEqual(signInWithPassword.mock.calls[0]?.arguments, ['ada@example.com', 'secret-pass']);
    assert.equal(signUpWithPassword.mock.callCount(), 0);
  });

  it('treats Enter-driven form submit the same as email sign-in submit', async () => {
    // Form onSubmit calls runEmailPasswordAuth — same path as clicking the primary button.
    const signInWithPassword = mock.fn(async () => undefined);
    const result = await runEmailPasswordAuth({
      busy: 'idle',
      mode: 'signin',
      email: 'enter@example.com',
      password: 'pass1234',
      handlers: {
        signInWithPassword,
        signUpWithPassword: async () => undefined,
      },
      onBusy: () => undefined,
      signupSuccessMessage: LOGIN_COPY.signupSuccess,
    });
    assert.equal(result.ok, true);
    assert.equal(signInWithPassword.mock.callCount(), 1);
  });

  it('blocks duplicate email submit while a request is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const signInWithPassword = mock.fn(async () => gate);
    let busy: 'idle' | 'email' | 'apple' | 'google' = 'idle';

    const first = runEmailPasswordAuth({
      busy,
      mode: 'signin',
      email: 'a@example.com',
      password: 'pass1234',
      handlers: {
        signInWithPassword,
        signUpWithPassword: async () => undefined,
      },
      onBusy: (next) => {
        busy = next;
      },
      signupSuccessMessage: LOGIN_COPY.signupSuccess,
    });

    // Allow microtasks so the first call locks busy.
    await Promise.resolve();
    assert.equal(busy, 'email');

    const second = await runEmailPasswordAuth({
      busy,
      mode: 'signin',
      email: 'a@example.com',
      password: 'pass1234',
      handlers: {
        signInWithPassword,
        signUpWithPassword: async () => undefined,
      },
      onBusy: (next) => {
        busy = next;
      },
      signupSuccessMessage: LOGIN_COPY.signupSuccess,
    });

    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.kind, 'blocked');
    assert.equal(signInWithPassword.mock.callCount(), 1);

    release();
    await first;
    assert.equal(busy, 'idle');
  });

  it('keeps Apple and Google loading states independent', async () => {
    assert.equal(isMethodLoading('apple', 'apple'), true);
    assert.equal(isMethodLoading('apple', 'google'), false);
    assert.equal(isMethodLoading('google', 'apple'), false);
    assert.equal(isMethodLoading('google', 'google'), true);
    assert.equal(isMethodLoading('email', 'apple'), false);
    assert.equal(canStartAuth('apple'), false);
    assert.equal(canStartAuth('idle'), true);

    let busy: 'idle' | 'apple' | 'google' | 'email' = 'idle';
    let releaseApple!: () => void;
    const appleGate = new Promise<void>((resolve) => {
      releaseApple = resolve;
    });

    const applePromise = runOAuthAuth({
      busy,
      provider: 'apple',
      handlers: {
        signInWithApple: async () => appleGate,
        signInWithGoogle: async () => undefined,
      },
      onBusy: (next) => {
        busy = next;
      },
    });
    await Promise.resolve();
    assert.equal(busy, 'apple');
    assert.equal(isMethodLoading(busy, 'apple'), true);
    assert.equal(isMethodLoading(busy, 'google'), false);

    const googleWhileApple = await runOAuthAuth({
      busy,
      provider: 'google',
      handlers: {
        signInWithApple: async () => undefined,
        signInWithGoogle: async () => undefined,
      },
      onBusy: (next) => {
        busy = next;
      },
    });
    assert.equal(googleWhileApple.ok, false);
    if (!googleWhileApple.ok) assert.equal(googleWhileApple.kind, 'blocked');

    releaseApple();
    await applePromise;
    assert.equal(busy, 'idle');
  });

  it('surfaces a friendly error when authentication fails', async () => {
    const result = await runEmailPasswordAuth({
      busy: 'idle',
      mode: 'signin',
      email: 'a@example.com',
      password: 'wrong-pass',
      handlers: {
        signInWithPassword: async () => {
          throw new Error('Invalid login credentials');
        },
        signUpWithPassword: async () => undefined,
      },
      onBusy: () => undefined,
      signupSuccessMessage: LOGIN_COPY.signupSuccess,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.kind, 'authError');
      assert.equal(result.error, '이메일 또는 비밀번호가 올바르지 않습니다.');
      assert.equal(uiContainsAuthSecrets(result.error ?? ''), false);
      assert.equal((result.error ?? '').includes('wrong-pass'), false);
    }
  });
});

describe('Couple Booth login screen — form UX', () => {
  it('toggles password visibility state', () => {
    assert.equal(togglePasswordVisible(false), true);
    assert.equal(togglePasswordVisible(true), false);
    assert.match(loginPageSource, /aria-label=\{showPassword \? t\(LOGIN_COPY\.hidePassword\) : t\(LOGIN_COPY\.showPassword\)\}/);
    assert.match(loginPageSource, /type=\{showPassword \? 'text' : 'password'\}/);
  });

  it('switches sign-in and sign-up primary labels', () => {
    assert.equal(primaryButtonLabel('signin', false), LOGIN_COPY.signIn);
    assert.equal(primaryButtonLabel('signup', false), LOGIN_COPY.signUp);
    assert.equal(primaryButtonLabel('signin', true), LOGIN_COPY.signInLoading);
    assert.equal(primaryButtonLabel('signup', true), LOGIN_COPY.signUpLoading);
    assert.match(loginPageSource, /switchMode\('signup'\)/);
    assert.match(loginPageSource, /switchMode\('signin'\)/);
    assert.match(loginPageSource, /createAccountAction/);
    assert.match(loginPageSource, /backToSignInAction/);
  });

  it('validates email and password near the fields', () => {
    const empty = validateEmailPassword('', '', 'signin');
    assert.equal(empty.ok, false);
    assert.equal(empty.emailError, LOGIN_COPY.emailRequired);
    assert.equal(empty.passwordError, LOGIN_COPY.passwordRequired);

    const badEmail = validateEmailPassword('not-an-email', 'pass1234', 'signin');
    assert.equal(badEmail.emailError, LOGIN_COPY.emailInvalid);

    const shortSignup = validateEmailPassword('a@b.co', '123', 'signup');
    assert.equal(shortSignup.passwordError, LOGIN_COPY.passwordTooShort);

    const ok = validateEmailPassword('a@b.co', 'pass1234', 'signin');
    assert.equal(ok.ok, true);
  });

  it('keeps key login controls available in mobile CSS layout', () => {
    assert.match(loginCss, /\.login-page/);
    assert.match(loginCss, /\.login-card/);
    assert.match(loginCss, /max\(18px,\s*env\(safe-area-inset/);
    assert.match(loginCss, /@media \(max-width: 480px\)/);
    assert.match(loginCss, /min-height: 54px/);
    assert.match(loginCss, /width: min\(100%, 460px\)/);
    assert.match(loginPageSource, /btn-oauth-apple/);
    assert.match(loginPageSource, /btn-oauth-google/);
    assert.match(loginPageSource, /login-submit/);
    assert.match(loginPageSource, /login-email/);
    assert.match(loginPageSource, /login-password/);
  });

  it('never places access or refresh tokens in login UI copy', () => {
    const blob = `${JSON.stringify(LOGIN_COPY)}\n${loginPageSource}`;
    assert.equal(uiContainsAuthSecrets(blob), false);
    assert.equal(blob.toLowerCase().includes('access_token'), false);
    assert.equal(blob.toLowerCase().includes('refresh_token'), false);
    assert.equal(
      formatLoginAuthError(new Error('refresh_token=abc access_token=xyz'), 'signin').includes('token'),
      false,
    );
  });
});
