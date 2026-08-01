'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton({ className = '', children = 'Sign out' }) {
  const router = useRouter();

  const signOut = async () => {
    await createClient().auth.signOut();
    // refresh() re-runs the server components so the nav drops back to its
    // logged-out state before we navigate away.
    router.refresh();
    router.push('/');
  };

  return (
    <button type="button" onClick={signOut} className={className}>
      {children}
    </button>
  );
}
