import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { authenticate, optionalAuth } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { camelize, pickSnake } from '../lib/case.js';
import { assertUuids, badRequest, conflict, notFound, slugify } from '../lib/http.js';
import { canAccessCourse, getEntitlements } from '../services/access.js';
import getStripe from '../services/stripe.js';

const router = Router();

const COURSE_COLUMNS =
  'id, slug, title, description, short_description, thumbnail_url, price, is_published, display_order, stripe_product_id, created_at, updated_at';

const VIDEO_COLUMNS =
  'id, title, description, thumbnail_url, duration_seconds, access_type, position, is_published, transcode_status';

const byPosition = (a, b) => a.position - b.position || a.title.localeCompare(b.title);

// ─── PUBLIC: published catalogue ─────────────────────────────────────────────

router.get('/', async (_req, res) => {
  const rows = unwrap(
    await db()
      .from('courses')
      .select(`${COURSE_COLUMNS}, videos(count)`)
      .eq('is_published', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false }),
    'list courses'
  );

  res.json(
    rows.map((row) => ({
      ...camelize(row),
      videos: undefined,
      videoCount: row.videos?.[0]?.count ?? 0,
    }))
  );
});

// ─── ADMIN: everything, including drafts (before /:slug so it isn't swallowed)

router.get('/admin/all', authenticate, requireAdmin, async (_req, res) => {
  const rows = unwrap(
    await db()
      .from('courses')
      .select(`${COURSE_COLUMNS}, videos(count)`)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false }),
    'list all courses'
  );

  res.json(
    rows.map((row) => ({
      ...camelize(row),
      videos: undefined,
      videoCount: row.videos?.[0]?.count ?? 0,
    }))
  );
});

router.get('/admin/:id', authenticate, requireAdmin, async (req, res) => {
  const row = unwrap(
    await db()
      .from('courses')
      .select(`${COURSE_COLUMNS}, videos(${VIDEO_COLUMNS})`)
      .eq('id', req.params.id)
      .maybeSingle(),
    'load course'
  );
  if (!row) throw notFound('Course not found');

  const course = camelize(row);
  course.videos = camelize([...(row.videos ?? [])].sort(byPosition));

  const tiers = unwrap(
    await db().from('tier_courses').select('tier_id').eq('course_id', req.params.id),
    'course tiers'
  );
  course.tierIds = tiers.map((t) => t.tier_id);

  res.json(course);
});

// ─── PROTECTED: the courses this member can actually watch ──────────────────
//  Declared before /:slug so "mine" isn't mistaken for a course slug.

router.get('/mine', authenticate, async (req, res) => {
  const entitlements = await getEntitlements(req.user);

  if (!entitlements.courseIds.length) {
    return res.json({ courses: [], entitlements });
  }

  const rows = unwrap(
    await db()
      .from('courses')
      .select(`${COURSE_COLUMNS}, videos(${VIDEO_COLUMNS})`)
      .in('id', entitlements.courseIds)
      .order('display_order', { ascending: true }),
    'list my courses'
  );

  const courses = rows.map((row) => ({
    ...camelize({ ...row, videos: undefined }),
    videos: camelize((row.videos ?? []).filter((v) => v.is_published).sort(byPosition)),
    // How they got in, so the dashboard can say "included with your membership".
    source: entitlements.purchasedCourseIds.includes(row.id) ? 'purchase' : 'membership',
  }));

  res.json({ courses, entitlements });
});

// ─── PUBLIC: course detail ───────────────────────────────────────────────────
//  Video titles are public so the sales page can show the curriculum. Playable
//  URLs are not in this response — those come from /videos/:id/stream after an
//  access check.

router.get('/:slug', optionalAuth, async (req, res) => {
  const row = unwrap(
    await db()
      .from('courses')
      .select(`${COURSE_COLUMNS}, videos(${VIDEO_COLUMNS})`)
      .eq('slug', req.params.slug)
      .eq('is_published', true)
      .maybeSingle(),
    'load course'
  );
  if (!row) throw notFound('Course not found');

  const hasAccess = await canAccessCourse(req.user, row.id);

  const videos = (row.videos ?? [])
    .filter((v) => v.is_published)
    .sort(byPosition)
    .map((v) => ({
      ...camelize(v),
      // Tells the UI whether to render a play button or a lock.
      locked: v.access_type !== 'public' && !hasAccess,
    }));

  res.json({ ...camelize(row), videos, hasAccess });
});

// ─── PROTECTED: buy a course outright ────────────────────────────────────────

router.post('/:id/checkout', authenticate, async (req, res) => {
  const course = unwrap(
    await db()
      .from('courses')
      .select('id, slug, title, description, price, stripe_product_id, stripe_price_id, is_published')
      .eq('id', req.params.id)
      .maybeSingle(),
    'load course'
  );
  if (!course || !course.is_published) throw notFound('Course not found');

  if (await canAccessCourse(req.user, course.id)) {
    throw badRequest('You already have access to this course');
  }

  const customerId = await ensureStripeCustomer(req.user);
  const priceId = await ensureCoursePrice(course);

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'payment',
    success_url: `${process.env.CLIENT_URL}/courses/${course.slug}?purchased=1`,
    cancel_url: `${process.env.CLIENT_URL}/courses/${course.slug}`,
    metadata: {
      userId: req.user.id,
      type: 'course',
      itemId: course.id,
    },
  });

  res.json({ url: session.url });
});

// ─── ADMIN: write operations ─────────────────────────────────────────────────

router.use(authenticate, requireAdmin);

router.post('/', async (req, res) => {
  const { title, description = '', price = 0, slug: rawSlug } = req.body;
  if (!title) throw badRequest('title is required');

  const slug = slugify(rawSlug || title);
  if (!slug) throw badRequest('Could not derive a URL slug from that title');

  const existing = unwrap(
    await db().from('courses').select('id').eq('slug', slug).maybeSingle(),
    'slug check'
  );
  if (existing) throw conflict(`The URL "${slug}" is already taken`);

  const product = await getStripe().products.create({
    name: title,
    ...(description ? { description } : {}),
  });

  const insert = {
    ...pickSnake(req.body, ['title', 'description', 'shortDescription', 'thumbnailUrl', 'price', 'displayOrder']),
    slug,
    title,
    description,
    price,
    stripe_product_id: product.id,
  };

  const course = unwrap(
    await db().from('courses').insert(insert).select(COURSE_COLUMNS).single(),
    'create course'
  );

  res.status(201).json(camelize(course));
});

router.patch('/:id', async (req, res) => {
  const course = unwrap(
    await db()
      .from('courses')
      .select('id, title, description, price, stripe_product_id, stripe_price_id')
      .eq('id', req.params.id)
      .maybeSingle(),
    'load course'
  );
  if (!course) throw notFound('Course not found');

  const updates = pickSnake(req.body, [
    'title',
    'description',
    'shortDescription',
    'thumbnailUrl',
    'price',
    'isPublished',
    'displayOrder',
  ]);

  if (req.body.slug !== undefined) {
    const slug = slugify(req.body.slug);
    if (!slug) throw badRequest('Invalid URL slug');

    const clash = unwrap(
      await db().from('courses').select('id').eq('slug', slug).neq('id', course.id).maybeSingle(),
      'slug check'
    );
    if (clash) throw conflict(`The URL "${slug}" is already taken`);
    updates.slug = slug;
  }

  // Keep the Stripe product in step with the catalogue.
  if (course.stripe_product_id) {
    const productUpdate = {};
    if (updates.title && updates.title !== course.title) productUpdate.name = updates.title;
    if (updates.description && updates.description !== course.description) {
      productUpdate.description = updates.description;
    }
    if (Object.keys(productUpdate).length) {
      await getStripe().products.update(course.stripe_product_id, productUpdate);
    }
  }

  // A price change means a new Stripe Price object — they're immutable. Drop
  // the cached id so the next checkout creates a fresh one at the new amount.
  if (updates.price !== undefined && Number(updates.price) !== Number(course.price)) {
    updates.stripe_price_id = null;
  }

  const updated = unwrap(
    await db().from('courses').update(updates).eq('id', course.id).select(COURSE_COLUMNS).single(),
    'update course'
  );

  res.json(camelize(updated));
});

// Attach / detach / reorder the course's videos in one call. The submitted
// array *is* the course: videos missing from it are detached, and a video can
// only ever belong to one course, which is what scopes a purchase.
router.put('/:id/videos', async (req, res) => {
  const { videoIds } = req.body;
  if (!Array.isArray(videoIds)) throw badRequest('videoIds must be an array');
  assertUuids(videoIds, 'video id');

  const course = unwrap(
    await db().from('courses').select('id').eq('id', req.params.id).maybeSingle(),
    'load course'
  );
  if (!course) throw notFound('Course not found');

  // Detach anything dropped from the list. Removed videos are unpublished too:
  // a course video with no course has nobody who can be entitled to it, so
  // leaving it live would just be a broken link.
  const detach = db()
    .from('videos')
    .update({ course_id: null, is_published: false, position: 0 })
    .eq('course_id', course.id);

  unwrap(
    await (videoIds.length ? detach.not('id', 'in', `(${videoIds.join(',')})`) : detach),
    'detach videos'
  );

  // Attach + set order for the submitted list.
  for (const [position, videoId] of videoIds.entries()) {
    unwrap(
      await db()
        .from('videos')
        .update({ course_id: course.id, position })
        .eq('id', videoId),
      'attach video'
    );
  }

  const videos = unwrap(
    await db().from('videos').select(VIDEO_COLUMNS).eq('course_id', course.id),
    'reload videos'
  );

  res.json({ id: course.id, videos: camelize(videos.sort(byPosition)) });
});

// Which subscription tiers include this course.
router.put('/:id/tiers', async (req, res) => {
  const { tierIds } = req.body;
  if (!Array.isArray(tierIds)) throw badRequest('tierIds must be an array');

  assertUuids(tierIds, 'tier id');

  unwrap(
    await db().from('tier_courses').delete().eq('course_id', req.params.id),
    'clear tier links'
  );

  if (tierIds.length) {
    unwrap(
      await db()
        .from('tier_courses')
        .insert(tierIds.map((tierId) => ({ tier_id: tierId, course_id: req.params.id }))),
      'set tier links'
    );
  }

  res.json({ success: true, tierIds });
});

router.delete('/:id', async (req, res) => {
  const course = unwrap(
    await db().from('courses').select('id, stripe_product_id').eq('id', req.params.id).maybeSingle(),
    'load course'
  );
  if (!course) throw notFound('Course not found');

  // Archive rather than delete in Stripe so past invoices stay intact.
  if (course.stripe_product_id) {
    await getStripe()
      .products.update(course.stripe_product_id, { active: false })
      .catch(() => {});
  }

  unwrap(await db().from('courses').delete().eq('id', course.id), 'delete course');
  res.json({ success: true });
});

// ─── Stripe helpers ──────────────────────────────────────────────────────────

export async function ensureStripeCustomer(profile) {
  if (profile.stripeCustomerId) return profile.stripeCustomerId;

  const customer = await getStripe().customers.create({
    email: profile.email,
    metadata: { supabaseUserId: profile.id },
  });

  unwrap(
    await db().from('profiles').update({ stripe_customer_id: customer.id }).eq('id', profile.id),
    'save stripe customer'
  );

  profile.stripeCustomerId = customer.id;
  return customer.id;
}

async function ensureCoursePrice(course) {
  if (course.stripe_price_id) return course.stripe_price_id;

  let productId = course.stripe_product_id;
  if (!productId) {
    const product = await getStripe().products.create({
      name: course.title,
      ...(course.description ? { description: course.description } : {}),
    });
    productId = product.id;
  }

  const price = await getStripe().prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: Math.round(Number(course.price) * 100),
  });

  unwrap(
    await db()
      .from('courses')
      .update({ stripe_product_id: productId, stripe_price_id: price.id })
      .eq('id', course.id),
    'cache stripe price'
  );

  return price.id;
}

export default router;
