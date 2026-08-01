import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase client for server components, route handlers and server actions.
 * Reads the session out of cookies so SSR knows who's logged in.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server components can't set cookies. The middleware refreshes the
            // session on every request, so it's safe to ignore this here.
          }
        },
      },
    }
  );
}

/** The signed-in auth user, or null. Always server-verified, never trusted from a cookie alone. */
export async function getSessionUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/** The signed-in user's access token, for calling the Express API. */
export async function getAccessToken() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** The caller's profile row (role, billing state), or null when logged out. */
export async function getProfile() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, subscription_status, subscription_tier_id, current_period_end')
    .eq('id', user.id)
    .maybeSingle();

  return data ?? null;
}

export default createClient;
