import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import stripe from '../services/stripe';
import User from '../models/User';
import SubscriptionTier from '../models/SubscriptionTier';

const router = Router();

// Public: list active subscription tiers
router.get('/tiers', async (_req: Request, res: Response): Promise<void> => {
  const tiers = await SubscriptionTier.find({ isActive: true }).sort({ displayOrder: 1 });
  res.json(tiers);
});

// All routes below require authentication
router.use(authenticate);

router.post(
  '/create-checkout-session',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { tierId, interval } = req.body;

    if (!tierId || !interval) {
      res.status(400).json({ error: 'tierId and interval required' });
      return;
    }

    const tier = await SubscriptionTier.findById(tierId);
    if (!tier || !tier.isActive) {
      res.status(404).json({ error: 'Subscription tier not found' });
      return;
    }

    const priceId =
      interval === 'annual'
        ? tier.stripePriceIds.annual
        : tier.stripePriceIds.monthly;

    if (!priceId) {
      res.status(400).json({ error: `No ${interval} price configured for this tier` });
      return;
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.CLIENT_URL}/dashboard?subscribed=true`,
      cancel_url: `${process.env.CLIENT_URL}/billing`,
      metadata: {
        userId: user._id.toString(),
        tierId: tier._id.toString(),
      },
    });

    res.json({ url: session.url });
  }
);

router.post(
  '/create-portal-session',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await User.findById(req.user!.id);
    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found' });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.CLIENT_URL}/dashboard`,
    });

    res.json({ url: session.url });
  }
);

router.get(
  '/subscription',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await User.findById(req.user!.id)
      .select('subscription stripeCustomerId')
      .populate('subscription.tierId');
    res.json(user?.subscription ?? { status: 'none' });
  }
);

export default router;
