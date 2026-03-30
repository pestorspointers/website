import { Router } from 'express';
import stripeClient from '../services/stripe.js';
import User from '../models/User.js';
import SubscriptionTier from '../models/SubscriptionTier.js';
import mongoose from 'mongoose';

const router = Router();

async function syncSubscription(sub) {
  const user = await User.findOne({ stripeCustomerId: sub.customer });
  if (!user) return;

  const priceId = sub.items.data[0]?.price.id;
  const tier = await SubscriptionTier.findOne({
    $or: [
      { 'stripePriceIds.monthly': priceId },
      { 'stripePriceIds.annual': priceId },
    ],
  });

  await User.findByIdAndUpdate(user._id, {
    'subscription.status': sub.status,
    'subscription.tierId': tier?._id,
    'subscription.stripeSubscriptionId': sub.id,
    'subscription.currentPeriodEnd': new Date(sub.current_period_end * 1000),
  });
}

router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    res.status(400).json({ error: 'Missing stripe signature' });
    return;
  }

  let event;
  try {
    event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch {
    res.status(400).json({ error: 'Invalid webhook signature' });
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;

      if (session.mode === 'subscription' && session.metadata?.userId) {
        const tier = await SubscriptionTier.findById(session.metadata.tierId);
        await User.findByIdAndUpdate(session.metadata.userId, {
          'subscription.status': 'active',
          'subscription.tierId': tier?._id,
          'subscription.stripeSubscriptionId': session.subscription,
        });
      } else if (session.mode === 'payment' && session.metadata?.userId) {
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
      const sub = event.data.object;
      await syncSubscription(sub);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await User.findOneAndUpdate(
        { stripeCustomerId: sub.customer },
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
      const invoice = event.data.object;
      await User.findOneAndUpdate(
        { stripeCustomerId: invoice.customer },
        { 'subscription.status': 'past_due' }
      );
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      await User.findOneAndUpdate(
        { stripeCustomerId: invoice.customer },
        { 'subscription.status': 'active' }
      );
      break;
    }
  }

  res.json({ received: true });
});

export default router;
