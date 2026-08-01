import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { authenticate, invalidateProfile } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { camelize } from '../lib/case.js';
import { badRequest, notFound } from '../lib/http.js';

const router = Router();
router.use(authenticate, requireAdmin);

// ─── Dashboard counters ──────────────────────────────────────────────────────

router.get('/stats', async (_req, res) => {
  // `head: true` puts the number on `result.count` rather than in `data`, so
  // these read the raw results instead of going through unwrap().
  const totals = await Promise.all([
    db().from('profiles').select('id', { count: 'exact', head: true }),
    db()
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('subscription_status', ['active', 'trialing']),
    db().from('courses').select('id', { count: 'exact', head: true }),
    db().from('videos').select('id', { count: 'exact', head: true }),
    db().from('blog_posts').select('id', { count: 'exact', head: true }),
    db().from('purchases').select('id', { count: 'exact', head: true }),
  ]);

  const [users, subscribers, courses, videos, posts, purchases] = totals.map(
    (r) => r.count ?? 0
  );

  const revenue = unwrap(
    await db().from('purchases').select('amount_cents'),
    'revenue'
  ).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);

  res.json({
    users,
    subscribers,
    courses,
    videos,
    posts,
    purchases,
    revenueCents: revenue,
  });
});

// ─── Users ───────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  const search = req.query.search?.trim();

  let query = db()
    .from('profiles')
    .select(
      'id, email, full_name, role, subscription_status, subscription_tier_id, current_period_end, created_at, subscription_tiers(name)'
    )
    .order('created_at', { ascending: false });

  if (search) query = query.ilike('email', `%${search}%`);

  const rows = unwrap(await query, 'list users');

  res.json(
    rows.map((row) => ({
      ...camelize(row),
      tierName: row.subscription_tiers?.name ?? null,
      subscriptionTiers: undefined,
    }))
  );
});

router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) throw badRequest('Invalid role');

  const target = unwrap(
    await db().from('profiles').select('id, role').eq('id', req.params.id).maybeSingle(),
    'find user'
  );
  if (!target) throw notFound('User not found');

  // Never let the last admin lock themselves out.
  if (target.role === 'admin' && role !== 'admin') {
    const { count } = await db()
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');

    if ((count ?? 0) <= 1) throw badRequest('At least one admin must remain');
  }

  const updated = unwrap(
    await db()
      .from('profiles')
      .update({ role })
      .eq('id', req.params.id)
      .select('id, email, full_name, role')
      .single(),
    'update role'
  );

  invalidateProfile(req.params.id);
  res.json(camelize(updated));
});

// Manually grant or revoke course access — the escape hatch for refunds,
// comps, and "Stripe did something weird" support requests.
router.post('/users/:id/grant-course', async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) throw badRequest('courseId is required');

  unwrap(
    await db()
      .from('course_entitlements')
      .upsert(
        { user_id: req.params.id, course_id: courseId, source: 'manual' },
        { onConflict: 'user_id,course_id', ignoreDuplicates: true }
      ),
    'grant course'
  );

  res.json({ success: true });
});

router.delete('/users/:id/grant-course/:courseId', async (req, res) => {
  unwrap(
    await db()
      .from('course_entitlements')
      .delete()
      .eq('user_id', req.params.id)
      .eq('course_id', req.params.courseId),
    'revoke course'
  );

  res.json({ success: true });
});

router.get('/users/:id/access', async (req, res) => {
  const rows = unwrap(
    await db()
      .from('course_entitlements')
      .select('course_id, source, granted_at, courses(title, slug)')
      .eq('user_id', req.params.id),
    'user access'
  );

  res.json(
    rows.map((r) => ({
      courseId: r.course_id,
      source: r.source,
      grantedAt: r.granted_at,
      title: r.courses?.title ?? null,
      slug: r.courses?.slug ?? null,
    }))
  );
});

export default router;
