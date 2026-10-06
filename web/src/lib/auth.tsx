import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { appUrl, supabase } from './supabase';
import { safeBoothReturnPath } from './boothRoutes';
import { clearAllGuestLinkTokenCaches } from '../features/coupleBooth/utils/guestLinkTokenCache';

export type Profile = {
  id: string;
  coupleId: string | null;
  displayName: string | null;
  isInternalTester: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export { safeBoothReturnPath } from './boothRoutes';

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, couple_id, display_name, is_internal_tester')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    // Column may be missing before migration; fall back without tester flag.
    const fallback = await supabase
      .from('profiles')
      .select('id, couple_id, display_name')
      .eq('id', userId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    if (!fallback.data) return null;
    return {
      id: String(fallback.data.id),
      coupleId: fallback.data.couple_id ? String(fallback.data.couple_id) : null,
      displayName: fallback.data.display_name ? String(fallback.data.display_name) : null,
      isInternalTester: false,
    };
  }
  if (!data) return null;
  return {
    id: String(data.id),
    coupleId: data.couple_id ? String(data.couple_id) : null,
    displayName: data.display_name ? String(data.display_name) : null,
    isInternalTester: Boolean(data.is_internal_tester),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) {
      setProfile(null);
      return null;
    }
    const next = await fetchProfile(userId);
    setProfile(next);
    return next;
  }, []);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        void fetchProfile(data.session.user.id)
          .then((p) => {
            if (mounted) setProfile(p);
          })
          .finally(() => {
            if (mounted) setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT' || !next?.user) {
        try {
          if (typeof sessionStorage !== 'undefined') clearAllGuestLinkTokenCaches(sessionStorage);
        } catch {
          // Ignore storage access errors (private mode).
        }
      }
      if (next?.user) {
        void fetchProfile(next.user.id).then(setProfile);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const redirectTo = useMemo(() => {
    return appUrl(safeBoothReturnPath(sessionStorage.getItem('booth_return_to')));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
      async signInWithPassword(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUpWithPassword(email, password) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
      },
      async signInWithGoogle() {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) throw error;
      },
      async signInWithApple() {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: { redirectTo },
        });
        if (error) throw error;
      },
      async signOut() {
        try {
          if (typeof sessionStorage !== 'undefined') clearAllGuestLinkTokenCaches(sessionStorage);
        } catch {
          // Ignore storage access errors (private mode).
        }
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setProfile(null);
      },
    }),
    [session, profile, loading, refreshProfile, redirectTo],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
