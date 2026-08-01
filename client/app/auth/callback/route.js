import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Where Supabase's emailed links land — account confirmation, magic links and
 * password resets all arrive here with a one-time code that gets exchanged for
 * a real session cookie.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Only ever redirect within this site — an open redirect here would be
      // handing attackers a trusted-looking link.
      const target = next.startsWith('/') ? next : '/dashboard';
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link-expired`);
}
