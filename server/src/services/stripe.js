import Stripe from 'stripe';

let _stripe;

/**
 * Whether online payments are configured. Anything that talks to Stripe checks
 * this first, so the catalogue — courses, plans, prices — can be built before a
 * Stripe account is connected, and syncs across once one is.
 */
export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
  }
  return _stripe;
}

export default getStripe;
