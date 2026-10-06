type AuthUserIdentity = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
};

function providerLabel(user: AuthUserIdentity): 'Apple' | 'Google' | 'email' {
  const provider = String(user.app_metadata?.provider ?? '').toLowerCase();
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata?.providers.map((value) => String(value).toLowerCase())
    : [];
  if (provider === 'apple' || providers.includes('apple')) return 'Apple';
  if (provider === 'google' || providers.includes('google')) return 'Google';
  return 'email';
}

export function signedInAccountLabel(user: AuthUserIdentity, showTestId: boolean): string {
  const metadata = user.user_metadata ?? {};
  const name = [metadata.full_name, metadata.name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
  const identity = user.email?.trim() || name || user.id.slice(0, 8);
  const parts = [identity, providerLabel(user)];
  if (showTestId) parts.push(user.id.slice(0, 8));
  return `Signed in as ${parts.join(' · ')}`;
}
