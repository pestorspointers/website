import { Router } from '../router.js';
import { db, unwrap } from '../config/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { camelize, pickSnake } from '../lib/case.js';
import { assertUuids, badRequest, isUuid, notFound } from '../lib/http.js';
import getStripe, { stripeEnabled } from '../services/stripe.js';
import { isTierSynced, syncTierToStripe } from '../services/tierStripe.js';

/**
 * Membership plans, admin side.
 *
 * A plan is saved to the database first and synced to Stripe afterwards. That
 * lets the catalogue be built before payments are connected, and means a Stripe
 * failure can never lose an admin's edits — the sync is retried on the next
 * save, and again at checkout.
 */

const router = Router();
router.use(authenticate, requireAdmin);

const TIER_COLUMNS =
  'id, name, description, features, price_monthly, price_annual, stripe_product_id, stripe_price_monthly_id, stripe_price_annual_id, is_active, display_order, created_at';

/** The plan as the admin UI sees it, including whether it can be bought yet. */
function present(row, courseIds) {
  return { ...camelize(row), courseIds, stripeSynced: isTierSynced(row) };
}

/** Features arrive as a list of lines; keep the non-empty ones, trimmed. */
function cleanFeatures(features) {
  if (!Array.isArray(features)) throw badRequest('features must be a list');
  return features
    .map((feature) => String(feature).trim())
    .filter(Boolean)
    .slice(0, 30);
}

/** A price from the form: a positive amount in dollars, or null when left empty. */
function parsePrice(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`A ${label} price is required`);
    return null;
  }
  const amount = Number(value);
  if (!(amount > 0)) throw badRequest(`The ${label} price must be greater than zero`);
  return Math.round(amount * 100) / 100;
}

async function loadTier(id) {
  if (!isUuid(id)) return null;
  return unwrap(
    await db().from('subscription_tiers').select('*').eq('id', id).maybeSingle(),
    'load tier'
  );
}

async function courseIdsFor(tierId) {
  const rows = unwrap(
    await db().from('tier_courses').select('course_id').eq('tier_id', tierId),
    'load tier courses'
  );
  return rows.map((row) => row.course_id);
}

/**
 * Sync a saved plan to Stripe without letting Stripe undo the save. Skipped
 * when payments aren't connected, and for retired plans.
 */
async function trySync(tier) {
  if (!stripeEnabled() || !tier.is_active) return { tier };
  try {
    return { tier: await syncTierToStripe(tier) };
  } catch (err) {
    // The sync saves each Stripe object as it goes, so report what stuck.
    const current = (await loadTier(tier.id)) ?? tier;
    return { tier: current, warning: `Saved, but Stripe rejected it: ${err.message}` };
  }
}

router.get('/', async (_req, res) => {
  const rows = unwrap(
    await db()
      .from('subscription_tiers')
      .select(`${TIER_COLUMNS}, tier_courses(course_id)`)
      .order('display_order', { ascending: true }),
    'list tiers'
  );

  res.json(
    rows.map(({ tier_courses: links, ...row }) =>
      present(row, (links ?? []).map((link) => link.course_id))
    )
  );
});

router.post('/', async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) throw badRequest('Plan name is required');

  // Everything is validated before anything is written.
  const insert = {
    name,
    description: String(req.body.description ?? ''),
    features: cleanFeatures(req.body.features ?? []),
    price_monthly: parsePrice(req.body.priceMonthly, 'monthly', { required: true }),
    price_annual: parsePrice(req.body.priceAnnual, 'yearly'),
    display_order: Number(req.body.displayOrder) || 0,
  };

  const row = unwrap(
    await db().from('subscription_tiers').insert(insert).select(TIER_COLUMNS).single(),
    'create tier'
  );

  const { tier, warning } = await trySync(row);
  res.status(201).json({ ...present(tier, []), ...(warning && { stripeWarning: warning }) });
});

router.patch('/:id', async (req, res) => {
  const tier = await loadTier(req.params.id);
  if (!tier) throw notFound('Plan not found');

  const updates = pickSnake(req.body, ['description', 'isActive', 'displayOrder']);

  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw badRequest('Plan name is required');
    updates.name = name;
  }
  if (req.body.features !== undefined) updates.features = cleanFeatures(req.body.features);

  // Prices are saved exactly as entered. A changed amount also clears the
  // cached Stripe price id — Stripe prices are immutable — so the sync below
  // mints a new one. Existing subscribers stay on the price they signed up at.
  if (req.body.priceMonthly !== undefined) {
    const next = parsePrice(req.body.priceMonthly, 'monthly', { required: true });
    if (next !== Number(tier.price_monthly)) {
      updates.price_monthly = next;
      updates.stripe_price_monthly_id = null;
    }
  }
  if (req.body.priceAnnual !== undefined) {
    // An empty yearly price removes the yearly option.
    const next = parsePrice(req.body.priceAnnual, 'yearly');
    const current = tier.price_annual === null ? null : Number(tier.price_annual);
    if (next !== current) {
      updates.price_annual = next;
      updates.stripe_price_annual_id = null;
    }
  }

  if (req.body.courseIds !== undefined) {
    if (!Array.isArray(req.body.courseIds)) throw badRequest('courseIds must be a list');
    assertUuids(req.body.courseIds, 'course id');
  }

  const saved = Object.keys(updates).length
    ? unwrap(
        await db()
          .from('subscription_tiers')
          .update(updates)
          .eq('id', tier.id)
          .select('*')
          .single(),
        'update tier'
      )
    : tier;

  // Which courses this plan unlocks. The submitted list replaces the old one.
  if (Array.isArray(req.body.courseIds)) {
    unwrap(await db().from('tier_courses').delete().eq('tier_id', tier.id), 'clear tier courses');

    if (req.body.courseIds.length) {
      unwrap(
        await db()
          .from('tier_courses')
          .insert(req.body.courseIds.map((courseId) => ({ tier_id: tier.id, course_id: courseId }))),
        'set tier courses'
      );
    }
  }

  // Keep the Stripe product's name and visibility in step, when there is one.
  const warnings = [];
  const productUpdate = {};
  if (updates.name !== undefined && updates.name !== tier.name) productUpdate.name = updates.name;
  if (updates.description && updates.description !== tier.description) {
    productUpdate.description = updates.description;
  }
  if (updates.is_active !== undefined && updates.is_active !== tier.is_active) {
    productUpdate.active = updates.is_active;
  }
  if (tier.stripe_product_id && stripeEnabled() && Object.keys(productUpdate).length) {
    try {
      await getStripe().products.update(tier.stripe_product_id, productUpdate);
    } catch (err) {
      warnings.push(`Saved, but Stripe didn't accept the change: ${err.message}`);
    }
  }

  const { tier: synced, warning } = await trySync(saved);
  if (warning) warnings.push(warning);

  res.json({
    ...present(synced, await courseIdsFor(tier.id)),
    ...(warnings.length > 0 && { stripeWarning: warnings.join(' ') }),
  });
});

// Retire rather than delete: subscribers keep their access and Stripe keeps its
// history. PATCH { isActive: true } brings a plan back.
router.delete('/:id', async (req, res) => {
  const tier = await loadTier(req.params.id);
  if (!tier) throw notFound('Plan not found');

  if (tier.stripe_product_id && stripeEnabled()) {
    await getStripe().products.update(tier.stripe_product_id, { active: false }).catch(() => {});
  }

  unwrap(
    await db().from('subscription_tiers').update({ is_active: false }).eq('id', tier.id),
    'retire tier'
  );

  res.json({ success: true });
});

export default router;
