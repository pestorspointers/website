import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for browser code. Uses the publishable (anon) key, so every
 * query it makes is subject to Row Level Security.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export default createClient;
