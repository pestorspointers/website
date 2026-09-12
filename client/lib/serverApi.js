import { getAccessToken } from './supabase/server';
import { dispatch } from './server/dispatch';

/**
 * Server-side helpers for talking to the API from server components.
 *
 * The API is part of this app now, so these call the router in-process instead
 * of making an HTTP request to it. Same routes, same auth, same JSON — just no
 * network hop, and no `API_URL` to configure or get wrong.
 *
 * The contract callers rely on is unchanged: a failure returns `fallback`
 * rather than throwing, so one broken panel never takes a whole page down.
 */

async function call(path, { token = null, fallback = null } = {}) {
  const [pathname, search = ''] = path.split('?');

  try {
    const { status, body } = await dispatch({
      method: 'GET',
      path: pathname,
      query: Object.fromEntries(new URLSearchParams(search)),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

    if (status >= 400) return fallback;
    return body;
  } catch {
    return fallback;
  }
}

/**
 * Fetch public data.
 *
 * The `revalidate` option is accepted and ignored: it used to set the ISR
 * window on an outbound `fetch`, and there is no longer a fetch to cache. The
 * marketing pages that relied on that caching now read Supabase directly
 * through `lib/publicData.js`.
 */
export async function apiGet(path, { fallback = null } = {}) {
  return call(path, { fallback });
}

/**
 * Fetch data that reads differently depending on who's asking — a course page
 * showing locked vs unlocked lessons, for example. Sends the token when there
 * is one.
 */
export async function apiGetPersonalized(path, { fallback = null } = {}) {
  const token = await getAccessToken();
  return call(path, { token, fallback });
}

/** Fetch data as the signed-in user. */
export async function apiGetAuthed(path, { fallback = null } = {}) {
  const token = await getAccessToken();
  if (!token) return fallback;
  return call(path, { token, fallback });
}
