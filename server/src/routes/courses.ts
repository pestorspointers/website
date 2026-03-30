import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import Course from '../models/Course';
import User from '../models/User';
import stripe from '../services/stripe';

const router = Router();

// ─── PUBLIC: list published courses ──────────────────────────────────────────

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const courses = await Course.find({ isPublished: true })
    .select('slug title description thumbnailUrl price videoIds createdAt')
    .sort({ createdAt: -1 });
  res.json(courses);
});

// ─── PUBLIC: course detail ────────────────────────────────────────────────────

router.get('/:slug', async (req: Request, res: Response): Promise<void> => {
  const course = await Course.findOne({ slug: req.params.slug, isPublished: true })
    .populate('videoIds', 'title description thumbnailUrl duration accessType');
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }
  res.json(course);
});

// ─── Authenticated routes below ───────────────────────────────────────────────

router.use(authenticate);

// PROTECTED: create one-time purchase Checkout Session for a course

router.post(
  '/:id/checkout',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const course = await Course.findById(req.params.id);
    if (!course || !course.isPublished) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Already purchased
    if (user.purchasedCourseIds.some((id) => id.equals(course._id as typeof id))) {
      res.status(400).json({ error: 'You already own this course' });
      return;
    }

    // Auto-create Stripe customer if needed
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
    }

    // Ensure the course has a Stripe price — create one-off price on the fly if missing
    let priceId: string;
    if (course.stripeProductId) {
      // Retrieve existing prices for this product and use the first active one
      const prices = await stripe.prices.list({
        product: course.stripeProductId,
        active: true,
        limit: 1,
      });
      if (prices.data.length > 0) {
        priceId = prices.data[0].id;
      } else {
        // Create a new price for this product
        const price = await stripe.prices.create({
          product: course.stripeProductId,
          currency: 'usd',
          unit_amount: Math.round(course.price * 100),
        });
        priceId = price.id;
      }
    } else {
      // Create product + price together
      const product = await stripe.products.create({
        name: course.title,
        description: course.description,
      });
      const price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: Math.round(course.price * 100),
      });
      await Course.findByIdAndUpdate(course._id, { stripeProductId: product.id });
      priceId = price.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/courses/${course.slug}?purchased=true`,
      cancel_url: `${process.env.CLIENT_URL}/courses/${course.slug}`,
      metadata: {
        userId: user._id.toString(),
        type: 'course',
        itemId: course._id.toString(),
      },
    });

    res.json({ url: session.url });
  }
);

// ─── ADMIN routes below ───────────────────────────────────────────────────────

router.use(requireAdmin);

// ADMIN: list all courses (including drafts)

router.get('/admin/all', async (_req: AuthRequest, res: Response): Promise<void> => {
  const courses = await Course.find().sort({ createdAt: -1 });
  res.json(courses);
});

// ADMIN: create course + auto-create Stripe Product

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { title, description, price, thumbnailUrl, slug: rawSlug } = req.body;

  if (!title || !description || price === undefined) {
    res.status(400).json({ error: 'title, description, and price are required' });
    return;
  }

  const slug = rawSlug || slugify(title);

  // Ensure slug is unique
  const existing = await Course.findOne({ slug });
  if (existing) {
    res.status(409).json({ error: `Slug "${slug}" already exists` });
    return;
  }

  // Create Stripe Product
  const product = await stripe.products.create({
    name: title,
    description,
  });

  const course = await Course.create({
    slug,
    title,
    description,
    price,
    thumbnailUrl,
    stripeProductId: product.id,
  });

  res.status(201).json(course);
});

// ADMIN: update course metadata

router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const allowed = ['title', 'description', 'price', 'thumbnailUrl', 'isPublished', 'slug'];
  const updateFields: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) updateFields[key] = req.body[key];
  }

  const course = await Course.findById(req.params.id);
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  // Sync title/description changes to Stripe
  if (course.stripeProductId) {
    const stripeUpdate: Record<string, string> = {};
    if (updateFields.title && updateFields.title !== course.title)
      stripeUpdate.name = updateFields.title as string;
    if (updateFields.description && updateFields.description !== course.description)
      stripeUpdate.description = updateFields.description as string;
    if (Object.keys(stripeUpdate).length > 0) {
      await stripe.products.update(course.stripeProductId, stripeUpdate);
    }
  }

  const updated = await Course.findByIdAndUpdate(req.params.id, updateFields, {
    new: true,
    runValidators: true,
  });
  res.json(updated);
});

// ADMIN: set video list for a course (replaces existing order)

router.put('/:id/videos', async (req: AuthRequest, res: Response): Promise<void> => {
  const { videoIds } = req.body;
  if (!Array.isArray(videoIds)) {
    res.status(400).json({ error: 'videoIds must be an array' });
    return;
  }

  const course = await Course.findByIdAndUpdate(
    req.params.id,
    { videoIds },
    { new: true }
  ).populate('videoIds', 'title thumbnailUrl duration accessType');

  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  res.json(course);
});

// ADMIN: delete course

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  // Archive the Stripe product so existing customers aren't affected
  if (course.stripeProductId) {
    await stripe.products.update(course.stripeProductId, { active: false }).catch(() => {});
  }

  await course.deleteOne();
  res.json({ success: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default router;
