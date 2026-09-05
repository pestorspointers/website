/**
 * Public site data, read straight from Supabase.
 *
 * The marketing pages used to fetch this through the Express API. That made the
 * API a hard dependency of every page — and because `apiGet` swallows failures
 * and returns a fallback, a missing API produced a site that looked empty
 * rather than broken. On Amplify, where only `client/` is deployed, that meant
 * the whole site rendered defaults.
 *
 * Everything here is content Row Level Security already publishes to anyone:
 * published pages, published courses, published posts, site settings. The
 * publishable key is the same one the browser gets, so nothing is exposed that
 * wasn't already public.
 *
 * The Express API is still the right place for writes, Stripe, uploads and
 * signed video URLs — anything needing the service-role key.
 */

import { createClient } from './supabase/server';

/** snake_case → camelCase, matching what the API used to return. */
const camel = (s) => s.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());

function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[camel(k)] = camelize(v);
  return out;
}

const byPosition = (a, b) => a.position - b.position;

const PAGE_COLUMNS =
  'id, slug, title, meta_title, meta_description, is_published, is_system, updated_at';
const COURSE_COLUMNS =
  'id, slug, title, description, short_description, thumbnail_url, price, is_published, display_order, stripe_product_id, created_at, updated_at';
const VIDEO_COLUMNS =
  'id, title, description, duration_seconds, thumbnail_url, access_type, position, is_published, price';
const POST_LIST_COLUMNS =
  'id, slug, title, excerpt, cover_image_url, tags, published_at, updated_at';

/**
 * Never let a data problem blank the page. Mirrors the old `apiGet` contract so
 * callers keep behaving the same way.
 */
async function safe(promise, fallback) {
  try {
    const { data, error } = await promise;
    if (error) return fallback;
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────

// `admin_emails` is withheld from the public payload, as the API did — it isn't
// secret, but there's no reason to advertise which addresses get admin.
const PRIVATE_SETTING_KEYS = new Set(['admin_emails']);

export async function fetchSettings() {
  const rows = await safe(createClient().from('site_settings').select('key, value'), []);
  const out = {};
  for (const row of rows) {
    if (!PRIVATE_SETTING_KEYS.has(row.key)) out[row.key] = row.value;
  }
  return out;
}

// ── Pages ────────────────────────────────────────────────────────────────────

export async function fetchPage(slug) {
  const row = await safe(
    createClient()
      .from('pages')
      .select(`${PAGE_COLUMNS}, page_blocks(id, type, position, is_visible, content)`)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle(),
    null
  );
  if (!row) return null;

  const { page_blocks: blocks, ...page } = row;
  return {
    ...camelize(page),
    blocks: (blocks ?? []).filter((b) => b.is_visible).sort(byPosition).map(camelize),
  };
}

// ── Courses ──────────────────────────────────────────────────────────────────

export async function fetchCourses() {
  const rows = await safe(
    createClient()
      .from('courses')
      .select(`${COURSE_COLUMNS}, videos(count)`)
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false }),
    []
  );
  return rows.map((row) => ({
    ...camelize({ ...row, videos: undefined }),
    videoCount: row.videos?.[0]?.count ?? 0,
  }));
}

export async function fetchCourse(slug) {
  const supabase = createClient();
  const row = await safe(
    supabase
      .from('courses')
      .select(`${COURSE_COLUMNS}, videos(${VIDEO_COLUMNS})`)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle(),
    null
  );
  if (!row) return null;

  // Whether to draw a play button or a padlock. Read through the viewer's own
  // session, so RLS decides what they can see — a logged-out visitor simply has
  // no entitlement rows. This is presentation only: playback is gated by
  // `GET /api/v1/videos/:id/stream`, which re-checks access before signing a URL.
  let hasAccess = false;
  const { data: { user } = {} } = await supabase.auth.getUser().catch(() => ({ data: {} }));
  if (user) {
    const entitlement = await safe(
      supabase
        .from('course_entitlements')
        .select('course_id')
        .eq('course_id', row.id)
        .eq('user_id', user.id)
        .maybeSingle(),
      null
    );
    hasAccess = Boolean(entitlement);
  }

  const { videos, ...course } = row;
  return {
    ...camelize(course),
    videos: (videos ?? [])
      .filter((v) => v.is_published)
      .sort(byPosition)
      .map((v) => ({ ...camelize(v), locked: v.access_type !== 'public' && !hasAccess })),
  };
}

// ── Blog ─────────────────────────────────────────────────────────────────────

export async function fetchPosts({ limit = 10, page = 1, tag = null } = {}) {
  const from = (page - 1) * limit;
  let query = createClient()
    .from('blog_posts')
    .select(POST_LIST_COLUMNS, { count: 'exact' })
    .eq('is_published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(from, from + limit - 1);
  if (tag) query = query.contains('tags', [tag]);

  try {
    const { data, error, count } = await query;
    if (error) return { posts: [], total: 0, page, limit };
    return { posts: camelize(data ?? []), total: count ?? 0, page, limit };
  } catch {
    return { posts: [], total: 0, page, limit };
  }
}

export async function fetchPost(slug) {
  const row = await safe(
    createClient()
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle(),
    null
  );
  return row ? camelize(row) : null;
}

// ── Pricing tiers ────────────────────────────────────────────────────────────

export async function fetchTiers() {
  const rows = await safe(
    createClient()
      .from('subscription_tiers')
      .select(
        'id, name, description, features, price_monthly, price_annual, stripe_price_monthly_id, stripe_price_annual_id, display_order, tier_courses(course_id)'
      )
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    []
  );
  return rows.map((row) => ({
    ...camelize({ ...row, tier_courses: undefined }),
    courseCount: (row.tier_courses ?? []).length,
  }));
}
