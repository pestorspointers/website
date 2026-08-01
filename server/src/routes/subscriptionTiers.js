import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { camelize, pickSnake } from '../lib/case.js';
import { assertUuids, badRequest, notFound } from '../lib/http.js';
import getStripe from '../services/stripe.js';

const router = Router();
router.use(authenticate, requireAdmin);

const TIER_COLUMNS =
  'id, name, description, features, price_monthly, price_annual, stripe_product_id, stripe_price_monthly_id, stripe_price_annual_id, is_active, display_order, created_at';

router.get('/', async (_req, res) => {
  const rows = unwrap(
    await db()
      .from('subscription_tiers')
      .select(`${TIER_COLUMNS}, tier_courses(course_id)`)
      .order('display_order', { ascending: true }),
    'list tiers'
  );

  res.json(
    rows.map((row) => ({
      ...camelize(row),
      tierCourses: undefined,
      courseIds: (row.tier_courses ?? []).map((t) => t.course_id),
    }))
  );
});

router.post('/', async (req, res) => {
  const { name, description = '', priceMonthly, priceAnnual, features = [], displayOrder = 0 } =
    req.body;

  if (!name) throw badRequest('name is required');
  if (!(Number(priceMonthly) > 0)) throw badRequest('A monthly price is required');

  const product = await getStripe().products.create({
    name,
    ...(description ? { description } : {}),
  });

  const monthly = await getStripe().prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: Math.round(Number(priceMonthly) * 100),
    recurring: { interval: 'month' },
  });

  let annual;
  if (Number(priceAnnual) > 0) {
    annual = await getStripe().prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: Math.round(Number(priceAnnual) * 100),
      recurring: { interval: 'year' },
    });
  }

  const tier = unwrap(
    await db()
      .from('subscription_tiers')
      .insert({
        name,
        description,
        features,
        price_monthly: priceMonthly,
        price_annual: priceAnnual || null,
        display_order: displayOrder,
        stripe_product_id: product.id,
        stripe_price_monthly_id: monthly.id,
        stripe_price_annual_id: annual?.id ?? null,
      })
      .select(TIER_COLUMNS)
      .single(),
    'create tier'
  );

  res.status(201).json(camelize(tier));
});

router.patch('/:id', async (req, res) => {
  const tier = unwrap(
    await db().from('subscription_tiers').select('*').eq('id', req.params.id).maybeSingle(),
    'load tier'
  );
  if (!tier) throw notFound('Tier not found');

  const updates = pickSnake(req.body, [
    'name',
    'description',
    'features',
    'isActive',
    'displayOrder',
  ]);

  if (tier.stripe_product_id) {
    const productUpdate = {};
    if (updates.name && updates.name !== tier.name) productUpdate.name = updates.name;
    if (updates.description !== undefined && updates.description !== tier.description) {
      productUpdate.description = updates.description || undefined;
    }
    if (updates.is_active !== undefined && updates.is_active !== tier.is_active) {
      productUpdate.active = updates.is_active;
    }
    if (Object.keys(productUpdate).length) {
      await getStripe().products.update(tier.stripe_product_id, productUpdate);
    }
  }

  // Stripe Prices are immutable, so a price change means minting a new one and
  // pointing the tier at it. Existing subscribers keep paying the old price
  // until they change plans — which is the behaviour you want.
  const newMonthly = await repriceIfChanged(tier, 'month', req.body.priceMonthly, tier.price_monthly);
  if (newMonthly) {
    updates.stripe_price_monthly_id = newMonthly;
    updates.price_monthly = req.body.priceMonthly;
  }

  const newAnnual = await repriceIfChanged(tier, 'year', req.body.priceAnnual, tier.price_annual);
  if (newAnnual) {
    updates.stripe_price_annual_id = newAnnual;
    updates.price_annual = req.body.priceAnnual;
  }

  const updated = unwrap(
    await db()
      .from('subscription_tiers')
      .update(updates)
      .eq('id', tier.id)
      .select(TIER_COLUMNS)
      .single(),
    'update tier'
  );

  // Which courses this tier unlocks.
  if (Array.isArray(req.body.courseIds)) {
    assertUuids(req.body.courseIds, 'course id');

    unwrap(
      await db().from('tier_courses').delete().eq('tier_id', tier.id),
      'clear tier courses'
    );

    if (req.body.courseIds.length) {
      unwrap(
        await db()
          .from('tier_courses')
          .insert(req.body.courseIds.map((courseId) => ({ tier_id: tier.id, course_id: courseId }))),
        'set tier courses'
      );
    }
  }

  const courseIds = unwrap(
    await db().from('tier_courses').select('course_id').eq('tier_id', tier.id),
    'reload tier courses'
  );

  res.json({ ...camelize(updated), courseIds: courseIds.map((c) => c.course_id) });
});

// Deactivate rather than delete: subscribers keep their access and Stripe keeps
// its history.
router.delete('/:id', async (req, res) => {
  const tier = unwrap(
    await db()
      .from('subscription_tiers')
      .select('id, stripe_product_id')
      .eq('id', req.params.id)
      .maybeSingle(),
    'load tier'
  );
  if (!tier) throw notFound('Tier not found');

  if (tier.stripe_product_id) {
    await getStripe().products.update(tier.stripe_product_id, { active: false }).catch(() => {});
  }

  unwrap(
    await db().from('subscription_tiers').update({ is_active: false }).eq('id', tier.id),
    'deactivate tier'
  );

  res.json({ success: true });
});

async function repriceIfChanged(tier, interval, nextPrice, currentPrice) {
  if (nextPrice === undefined || nextPrice === null || nextPrice === '') return null;
  if (Number(nextPrice) === Number(currentPrice)) return null;
  if (!(Number(nextPrice) > 0)) throw badRequest('Prices must be greater than zero');
  if (!tier.stripe_product_id) return null;

  const price = await getStripe().prices.create({
    product: tier.stripe_product_id,
    currency: 'usd',
    unit_amount: Math.round(Number(nextPrice) * 100),
    recurring: { interval },
  });

  return price.id;
}

export default router;
