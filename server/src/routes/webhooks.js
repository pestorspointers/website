import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { invalidateProfile } from '../middleware/authenticate.js';
import { grantPurchase, recordInvoicePayment } from '../services/access.js';
import getStripe from '../services/stripe.js';

const router = Router();

/**
 * Stripe is the source of truth for money; this endpoint is how that truth
 * reaches the database. Mounted with express.raw() BEFORE express.json() in
 * index.js — signature verification needs the untouched body.
 */

async function profileByCustomer(customerId) {
  if (!customerId) return null;
  return unwrap(
    await db()
      .from('profiles')
      .select('id, email, subscription_status')
      .eq('stripe_customer_id', customerId)
      .maybeSingle(),
    'find profile by customer'
  );
}

async function tierByPriceId(priceId) {
  if (!priceId) return null;
  return unwrap(
    await db()
      .from('subscription_tiers')
      .select('id')
      .or(`stripe_price_monthly_id.eq.${priceId},stripe_price_annual_id.eq.${priceId}`)
      .maybeSingle(),
    'find tier by price'
  );
}

async function updateProfile(userId, patch) {
  unwrap(await db().from('profiles').update(patch).eq('id', userId), 'update profile');
  // The auth middleware caches profiles briefly; drop it so the very next
  // request sees the new subscription state.
  invalidateProfile(userId);
}

/**
 * Mirrors a Stripe subscription onto the user's profile. Returns the profile
 * and matched tier so callers can log the payment against them.
 */
async function syncSubscription(subscription) {
  const profile =
    (subscription.metadata?.userId
      ? unwrap(
          await db()
            .from('profiles')
            .select('id')
            .eq('id', subscription.metadata.userId)
            .maybeSingle(),
          'find profile by metadata'
        )
      : null) ?? (await profileByCustomer(subscription.customer));

  if (!profile) return null;

  const item = subscription.items?.data?.[0];
  const tier = await tierByPriceId(item?.price?.id);

  // `current_period_end` sits on the subscription in older API versions and on
  // the item in newer ones — accept either.
  const periodEnd = subscription.current_period_end ?? item?.current_period_end;

  await updateProfile(profile.id, {
    subscription_status: subscription.status,
    subscription_tier_id: tier?.id ?? null,
    stripe_subscription_id: subscription.id,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  });

  return { profile, tier };
}

router.post('/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    res.status(400).json({ error: 'Missing Stripe signature' });
    return;
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, secret);
  } catch (err) {
    console.error('Stripe signature verification failed:', err.message);
    res.status(400).json({ error: 'Invalid webhook signature' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, type, itemId, tierId } = session.metadata ?? {};
        if (!userId) break;

        if (session.mode === 'subscription') {
          // No ledger row here on purpose: `invoice.payment_succeeded` fires
          // for this same first payment and for every renewal after it, so
          // logging money in one place keeps the totals honest.
          if (session.subscription) {
            const subscription = await getStripe().subscriptions.retrieve(session.subscription);
            await syncSubscription(subscription);
          }
        } else if (session.mode === 'payment' && itemId) {
          await grantPurchase({
            userId,
            type: type === 'video' ? 'video' : 'course',
            courseId: type === 'course' ? itemId : null,
            videoId: type === 'video' ? itemId : null,
            amountCents: session.amount_total ?? 0,
            currency: session.currency ?? 'usd',
            checkoutSessionId: session.id,
            paymentIntentId: session.payment_intent ?? null,
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed': {
        await syncSubscription(event.data.object);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const profile = await profileByCustomer(subscription.customer);
        if (profile) {
          await updateProfile(profile.id, {
            subscription_status: 'canceled',
            subscription_tier_id: null,
            stripe_subscription_id: null,
            cancel_at_period_end: false,
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;
        const profile = await profileByCustomer(invoice.customer);
        if (profile) await updateProfile(profile.id, { subscription_status: 'past_due' });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;

        // Re-read the subscription so status and period end stay authoritative
        // rather than assumed.
        const subscription = await getStripe().subscriptions.retrieve(invoice.subscription);
        const synced = await syncSubscription(subscription);

        if (synced) {
          await recordInvoicePayment({
            userId: synced.profile.id,
            invoiceId: invoice.id,
            subscriptionId: invoice.subscription,
            tierId: synced.tier?.id ?? null,
            amountCents: invoice.amount_paid ?? 0,
            currency: invoice.currency ?? 'usd',
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Returning 500 tells Stripe to retry, which is what we want for a
    // transient database failure.
    console.error(`Failed handling ${event.type}:`, err);
    res.status(500).json({ error: 'Webhook handler failed' });
    return;
  }

  res.json({ received: true });
});

export default router;
