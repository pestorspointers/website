import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import SubscriptionTier from '../models/SubscriptionTier.js';
import stripe from '../services/stripe.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/', async (_req, res) => {
  const tiers = await SubscriptionTier.find().sort({ displayOrder: 1 });
  res.json(tiers);
});

router.post('/', async (req, res) => {
  const { name, description, prices, displayOrder } = req.body;

  if (!name || !description || !prices?.monthly) {
    res.status(400).json({ error: 'name, description, and monthly price required' });
    return;
  }

  const product = await stripe.products.create({ name, description });

  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: Math.round(prices.monthly * 100),
    recurring: { interval: 'month' },
  });

  let annualPriceId;
  if (prices.annual) {
    const annualPrice = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: Math.round(prices.annual * 100),
      recurring: { interval: 'year' },
    });
    annualPriceId = annualPrice.id;
  }

  const tier = await SubscriptionTier.create({
    name,
    description,
    stripeProductId: product.id,
    stripePriceIds: {
      monthly: monthlyPrice.id,
      annual: annualPriceId,
    },
    displayOrder: displayOrder ?? 0,
  });

  res.status(201).json(tier);
});

router.patch('/:id', async (req, res) => {
  const { name, description, isActive, displayOrder, unlockedCourseIds } = req.body;

  const tier = await SubscriptionTier.findById(req.params.id);
  if (!tier) {
    res.status(404).json({ error: 'Tier not found' });
    return;
  }

  if (tier.stripeProductId) {
    const nameChanged = name && name !== tier.name;
    const descChanged = description && description !== tier.description;
    const activeChanged = typeof isActive === 'boolean' && isActive !== tier.isActive;

    if (nameChanged || descChanged || activeChanged) {
      await stripe.products.update(tier.stripeProductId, {
        ...(nameChanged && { name }),
        ...(descChanged && { description }),
        ...(activeChanged && { active: isActive }),
      });
    }
  }

  const updateFields = {};
  if (name !== undefined) updateFields.name = name;
  if (description !== undefined) updateFields.description = description;
  if (isActive !== undefined) updateFields.isActive = isActive;
  if (displayOrder !== undefined) updateFields.displayOrder = displayOrder;
  if (unlockedCourseIds !== undefined) updateFields.unlockedCourseIds = unlockedCourseIds;

  const updated = await SubscriptionTier.findByIdAndUpdate(
    req.params.id,
    updateFields,
    { new: true }
  );

  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const tier = await SubscriptionTier.findById(req.params.id);
  if (!tier) {
    res.status(404).json({ error: 'Tier not found' });
    return;
  }

  if (tier.stripeProductId) {
    await stripe.products.update(tier.stripeProductId, { active: false });
  }

  await SubscriptionTier.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ message: 'Tier deactivated' });
});

export default router;
