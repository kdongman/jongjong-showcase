/**
 * Map Supabase/auth failures to user-facing Korean messages.
 * Never echo passwords or raw tokens.
 */
export function formatLoginAuthError(err: unknown, context: 'signin' | 'signup' | 'oauth' = 'signin'): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const lower = raw.toLowerCase();

  if (looksLikeSecretLeak(raw)) {
    return fallbackMessage(context);
  }

  if (lower.includes('invalid login credentials') || lower.includes('invalid email or password')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (lower.includes('email not confirmed')) {
    return '이메일 인증이 필요합니다. 받은편지함을 확인해 주세요.';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return '이미 가입된 이메일입니다. 로그인해 주세요.';
  }
  if (lower.includes('password should be at least') || lower.includes('password is known to be weak')) {
    return '비밀번호가 보안 요구사항을 충족하지 않습니다.';
  }
  if (
    lower.includes('popup') ||
    lower.includes('provider is not enabled') ||
    lower.includes('oauth') ||
    lower.includes('redirect')
  ) {
    return '소셜 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return '네트워크 연결을 확인해 주세요.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }

  return fallbackMessage(context);
}

function fallbackMessage(context: 'signin' | 'signup' | 'oauth'): string {
  if (context === 'signup') return '계정 만들기에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  if (context === 'oauth') return '소셜 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  return '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}

function looksLikeSecretLeak(message: string): boolean {
  return /access[_-]?token|refresh[_-]?token|bearer\s+[a-z0-9._-]+|eyj[a-z0-9_-]+\.[a-z0-9_-]+/i.test(
    message,
  );
}

export function uiContainsAuthSecrets(text: string): boolean {
  return looksLikeSecretLeak(text);
}
