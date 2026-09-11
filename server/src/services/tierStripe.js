import { db, unwrap } from '../config/supabase.js';
import getStripe, { stripeEnabled } from './stripe.js';

/** Dollars to the integer cents Stripe expects. */
export const toCents = (amount) => Math.round(Number(amount) * 100);

const hasAmount = (amount) => amount !== null && amount !== undefined && Number(amount) > 0;

/**
 * Whether every price a plan offers exists in Stripe — that is, whether
 * someone can actually subscribe to it right now.
 */
export function isTierSynced(tier) {
  if (!tier.stripe_product_id) return false;
  if (hasAmount(tier.price_monthly) && !tier.stripe_price_monthly_id) return false;
  if (hasAmount(tier.price_annual) && !tier.stripe_price_annual_id) return false;
  return true;
}

/**
 * Creates whatever a membership plan is missing in Stripe: the product if it
 * has none, and a recurring price for each amount that doesn't have one.
 *
 * Plans are saved to the database first and synced after, which is what lets
 * them be built before Stripe is connected. A price change clears the plan's
 * cached price id (Stripe prices are immutable) and the next sync mints a
 * replacement. This runs after admin saves and again at checkout, so a plan
 * that missed a sync is repaired the first time someone tries to buy it.
 *
 * Every object is tagged with the plan id; the webhook relies on that to find
 * the plan for subscribers still on a price the plan has since moved off.
 *
 * Each Stripe object is saved the moment it's created, so a failure part-way
 * leaves nothing orphaned — the retry reuses what already exists. Idempotent:
 * a synced plan costs no Stripe calls. Returns the plan row as it now stands.
 */
export async function syncTierToStripe(tier) {
  if (!stripeEnabled() || isTierSynced(tier)) return tier;

  const stripe = getStripe();
  const metadata = { tierId: tier.id };
  let current = tier;

  const save = async (patch) => {
    current = unwrap(
      await db().from('subscription_tiers').update(patch).eq('id', tier.id).select('*').single(),
      'save stripe ids'
    );
  };

  if (!current.stripe_product_id) {
    const product = await stripe.products.create({
      name: current.name,
      ...(current.description ? { description: current.description } : {}),
      metadata,
    });
    await save({ stripe_product_id: product.id });
  }

  for (const [amountKey, idKey, interval] of [
    ['price_monthly', 'stripe_price_monthly_id', 'month'],
    ['price_annual', 'stripe_price_annual_id', 'year'],
  ]) {
    if (!hasAmount(current[amountKey]) || current[idKey]) continue;

    const price = await stripe.prices.create({
      product: current.stripe_product_id,
      currency: 'usd',
      unit_amount: toCents(current[amountKey]),
      recurring: { interval },
      metadata,
    });
    await save({ [idKey]: price.id });
  }

  return current;
}
