import type { User } from '@supabase/supabase-js';
import { signedInAccountLabel } from '../utils/accountIdentity';

export function SignedInAccount({ user }: { user: User }) {
  const isTestEnvironment = import.meta.env.DEV || import.meta.env.MODE === 'test';
  return <p className="signed-in-account">{signedInAccountLabel(user, isTestEnvironment)}</p>;
}
