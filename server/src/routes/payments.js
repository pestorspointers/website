import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { camelize } from '../lib/case.js';
import { badRequest, notFound } from '../lib/http.js';
import { getEntitlements } from '../services/access.js';
import { ensureStripeCustomer } from './courses.js';
import getStripe from '../services/stripe.js';

const router = Router();

// ─── PUBLIC: pricing table ───────────────────────────────────────────────────

router.get('/tiers', async (_req, res) => {
  const rows = unwrap(
    await db()
      .from('subscription_tiers')
      .select(
        'id, name, description, features, price_monthly, price_annual, stripe_price_monthly_id, stripe_price_annual_id, display_order, tier_courses(course_id)'
      )
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    'list tiers'
  );

  res.json(
    rows.map((row) => ({
      ...camelize(row),
      tierCourses: undefined,
      courseCount: (row.tier_courses ?? []).length,
    }))
  );
});

router.use(authenticate);

// ─── Subscribe ───────────────────────────────────────────────────────────────

router.post('/create-checkout-session', async (req, res) => {
  const { tierId, interval = 'monthly' } = req.body;
  if (!tierId) throw badRequest('tierId is required');

  const tier = unwrap(
    await db()
      .from('subscription_tiers')
      .select('id, name, is_active, stripe_price_monthly_id, stripe_price_annual_id')
      .eq('id', tierId)
      .maybeSingle(),
    'load tier'
  );
  if (!tier || !tier.is_active) throw notFound('That plan is no longer available');

  const priceId =
    interval === 'annual' ? tier.stripe_price_annual_id : tier.stripe_price_monthly_id;
  if (!priceId) throw badRequest(`This plan has no ${interval} price configured`);

  const customerId = await ensureStripeCustomer(req.user);

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.CLIENT_URL}/dashboard?subscribed=1`,
    cancel_url: `${process.env.CLIENT_URL}/billing`,
    metadata: { userId: req.user.id, type: 'subscription', tierId: tier.id },
    subscription_data: {
      metadata: { userId: req.user.id, tierId: tier.id },
    },
  });

  res.json({ url: session.url });
});

// ─── Manage an existing subscription ─────────────────────────────────────────

router.post('/create-portal-session', async (req, res) => {
  if (!req.user.stripeCustomerId) throw badRequest('No billing account yet');

  const session = await getStripe().billingPortal.sessions.create({
    customer: req.user.stripeCustomerId,
    return_url: `${process.env.CLIENT_URL}/dashboard`,
  });

  res.json({ url: session.url });
});

// ─── What the current user can see ───────────────────────────────────────────

router.get('/subscription', async (req, res) => {
  const entitlements = await getEntitlements(req.user);

  let tier = null;
  if (req.user.subscriptionTierId) {
    const row = unwrap(
      await db()
        .from('subscription_tiers')
        .select('id, name, description, price_monthly, price_annual')
        .eq('id', req.user.subscriptionTierId)
        .maybeSingle(),
      'load tier'
    );
    tier = row ? camelize(row) : null;
  }

  res.json({
    status: req.user.subscriptionStatus ?? 'none',
    currentPeriodEnd: req.user.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: req.user.cancelAtPeriodEnd ?? false,
    tier,
    entitlements,
  });
});

router.get('/purchases', async (req, res) => {
  const rows = unwrap(
    await db()
      .from('purchases')
      .select('id, type, amount_cents, currency, created_at, courses(title, slug), videos(title)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false }),
    'list purchases'
  );

  res.json(
    rows.map((row) => ({
      ...camelize({ ...row, courses: undefined, videos: undefined }),
      title: row.courses?.title ?? row.videos?.title ?? 'Subscription',
      courseSlug: row.courses?.slug ?? null,
    }))
  );
});

export default router;
