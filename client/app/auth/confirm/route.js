import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Landing spot for emailed links that carry a `token_hash` rather than a PKCE
 * `code` — invites and anything else Supabase generates server-side, where the
 * browser never held a code verifier.
 *
 * Without this, those links fall back to Supabase's implicit flow and arrive
 * with the tokens in the URL *fragment*, which a server route can never read.
 * The Invite email template points here.
 */

// Where each link type should drop the user once the token checks out.
const LANDING = {
  invite: '/set-password',
  recovery: '/reset-password',
  signup: '/dashboard',
  magiclink: '/dashboard',
  email_change: '/account',
};

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? LANDING[type] ?? '/dashboard';

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      // Only ever redirect within this site — an open redirect here would be
      // handing attackers a trusted-looking link.
      const target = next.startsWith('/') ? next : '/dashboard';
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  // Expired, already spent (corporate mail scanners prefetch links), or junk.
  return NextResponse.redirect(`${origin}/login?error=link-expired`);
}
