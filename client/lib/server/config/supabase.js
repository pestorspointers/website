import { createClient } from '@supabase/supabase-js';

let _client;

/**
 * The project URL. Accepts either spelling: the API brought `SUPABASE_URL` with
 * it from the standalone Express service, while the Next app already had
 * `NEXT_PUBLIC_SUPABASE_URL` set for the browser client. They are the same
 * value, and it is not a secret, so either one will do and neither has to be
 * duplicated in the hosting environment.
 */
export function supabaseUrl() {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Service-role Supabase client. Bypasses RLS — server only. The key is read
 * from `SUPABASE_SERVICE_ROLE_KEY` or, matching what the Next app already
 * used, `SUPABASE_SECRET_KEY`. Never expose either to the browser.
 */
export function db() {
  if (!_client) {
    const url = supabaseUrl();
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

    if (!url || !key) {
      throw new Error(
        'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) ' +
          'and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).'
      );
    }

    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

/** Throws on a Supabase error, otherwise returns the data. */
export function unwrap({ data, error }, context = 'query') {
  if (error) {
    const err = new Error(`Supabase ${context} failed: ${error.message}`);
    err.cause = error;
    throw err;
  }
  return data;
}

export default db;
