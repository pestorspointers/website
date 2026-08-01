import { getAccessToken } from './supabase/server';

/**
 * Server-side helpers for talking to the Express API from server components.
 *
 * `API_URL` is the internal address (no NEXT_PUBLIC_ prefix, so it never ships
 * to the browser); it falls back to the public one for simple single-host
 * deployments.
 */
const BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * Fetch public data. `revalidate` seconds of ISR caching by default — the site
 * is mostly static marketing content, so it should not hit the API on every
 * page view.
 */
export async function apiGet(path, { revalidate = 60, fallback = null } = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate } });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    // A dead API shouldn't take the marketing site down with it.
    return fallback;
  }
}

/**
 * Fetch data that reads differently depending on who's asking — a course page
 * showing locked vs unlocked lessons, for example. Sends the token when there
 * is one and skips the cache either way, since the response is per-person.
 */
export async function apiGetPersonalized(path, { fallback = null } = {}) {
  const token = await getAccessToken();

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

/** Fetch data as the signed-in user. Never cached — it's per-person. */
export async function apiGetAuthed(path, { fallback = null } = {}) {
  const token = await getAccessToken();
  if (!token) return fallback;

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}
