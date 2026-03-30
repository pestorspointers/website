import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import stripeClient from '../services/stripe';
import User from '../models/User';
import SubscriptionTier from '../models/SubscriptionTier';
import mongoose from 'mongoose';

const router = Router();

async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const user = await User.findOne({ stripeCustomerId: sub.customer as string });
  if (!user) return;

  const priceId = sub.items.data[0]?.price.id;
  const tier = await SubscriptionTier.findOne({
    $or: [
      { 'stripePriceIds.monthly': priceId },
      { 'stripePriceIds.annual': priceId },
    ],
  });

  await User.findByIdAndUpdate(user._id, {
    'subscription.status': sub.status as 'active' | 'past_due' | 'canceled',
    'subscription.tierId': tier?._id,
    'subscription.stripeSubscriptionId': sub.id,
    'subscription.currentPeriodEnd': new Date(sub.current_period_end * 1000),
  });
}

router.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    res.status(400).json({ error: 'Missing stripe signature' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch {
    res.status(400).json({ error: 'Invalid webhook signature' });
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === 'subscription' && session.metadata?.userId) {
        // Subscription checkout — grant access
        const tier = await SubscriptionTier.findById(session.metadata.tierId);
        await User.findByIdAndUpdate(session.metadata.userId, {
          'subscription.status': 'active',
          'subscription.tierId': tier?._id,
          'subscription.stripeSubscriptionId': session.subscription as string,
        });
      } else if (session.mode === 'payment' && session.metadata?.userId) {
        // One-time purchase — grant video or course access
        const { userId, type, itemId } = session.metadata;
        if (type === 'video' && itemId) {
          await User.findByIdAndUpdate(userId, {
            $addToSet: { purchasedVideoIds: new mongoose.Types.ObjectId(itemId) },
          });
        } else if (type === 'course' && itemId) {
          await User.findByIdAndUpdate(userId, {
            $addToSet: { purchasedCourseIds: new mongoose.Types.ObjectId(itemId) },
          });
        }
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await User.findOneAndUpdate(
        { stripeCustomerId: sub.customer as string },
        {
          'subscription.status': 'canceled',
          $unset: {
            'subscription.tierId': '',
            'subscription.stripeSubscriptionId': '',
          },
        }
      );
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await User.findOneAndUpdate(
        { stripeCustomerId: invoice.customer as string },
        { 'subscription.status': 'past_due' }
      );
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      await User.findOneAndUpdate(
        { stripeCustomerId: invoice.customer as string },
        { 'subscription.status': 'active' }
      );
      break;
    }
  }

  res.json({ received: true });
});

export default router;
