import { createClient } from '@supabase/supabase-js';

let _client;

/**
 * Service-role Supabase client. Bypasses RLS — only ever use this on the
 * server, never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function db() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in server/.env'
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
