import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { camelize, pickSnake } from '../lib/case.js';
import { badRequest, conflict, notFound, slugify } from '../lib/http.js';

const router = Router();

const LIST_COLUMNS =
  'id, slug, title, excerpt, author, tags, cover_image_url, is_published, published_at, created_at';

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
  const from = (page - 1) * limit;

  let query = db()
    .from('blog_posts')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('is_published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(from, from + limit - 1);

  if (req.query.tag) query = query.contains('tags', [req.query.tag]);

  const { data, error, count } = await query;
  if (error) throw new Error(`Supabase list posts failed: ${error.message}`);

  res.json({
    posts: camelize(data ?? []),
    total: count ?? 0,
    page,
    pages: Math.ceil((count ?? 0) / limit),
  });
});

// ─── ADMIN listing — declared before /:slug so it isn't read as a slug ───────

router.get('/admin/all', authenticate, requireAdmin, async (_req, res) => {
  const rows = unwrap(
    await db().from('blog_posts').select(LIST_COLUMNS).order('created_at', { ascending: false }),
    'list all posts'
  );
  res.json(camelize(rows));
});

router.get('/admin/:id', authenticate, requireAdmin, async (req, res) => {
  const row = unwrap(
    await db().from('blog_posts').select('*').eq('id', req.params.id).maybeSingle(),
    'load post'
  );
  if (!row) throw notFound('Post not found');
  res.json(camelize(row));
});

router.get('/:slug', async (req, res) => {
  const row = unwrap(
    await db()
      .from('blog_posts')
      .select('*')
      .eq('slug', req.params.slug)
      .eq('is_published', true)
      .maybeSingle(),
    'load post'
  );
  if (!row) throw notFound('Post not found');
  res.json(camelize(row));
});

// ─── ADMIN writes ────────────────────────────────────────────────────────────

router.use(authenticate, requireAdmin);

router.post('/', async (req, res) => {
  const { title, slug: rawSlug, isPublished = false } = req.body;
  if (!title) throw badRequest('title is required');

  const slug = slugify(rawSlug || title);
  if (!slug) throw badRequest('Could not derive a URL slug from that title');

  const existing = unwrap(
    await db().from('blog_posts').select('id').eq('slug', slug).maybeSingle(),
    'slug check'
  );
  if (existing) throw conflict(`The URL "${slug}" is already taken`);

  const insert = {
    ...pickSnake(req.body, [
      'title',
      'mdxContent',
      'excerpt',
      'author',
      'tags',
      'coverImageUrl',
      'isPublished',
    ]),
    slug,
    published_at: isPublished ? new Date().toISOString() : null,
  };

  const post = unwrap(
    await db().from('blog_posts').insert(insert).select('*').single(),
    'create post'
  );

  res.status(201).json(camelize(post));
});

router.patch('/:id', async (req, res) => {
  const post = unwrap(
    await db()
      .from('blog_posts')
      .select('id, is_published, published_at')
      .eq('id', req.params.id)
      .maybeSingle(),
    'load post'
  );
  if (!post) throw notFound('Post not found');

  const updates = pickSnake(req.body, [
    'title',
    'mdxContent',
    'excerpt',
    'author',
    'tags',
    'coverImageUrl',
    'isPublished',
  ]);

  if (req.body.slug !== undefined) {
    const slug = slugify(req.body.slug);
    if (!slug) throw badRequest('Invalid URL slug');

    const clash = unwrap(
      await db().from('blog_posts').select('id').eq('slug', slug).neq('id', post.id).maybeSingle(),
      'slug check'
    );
    if (clash) throw conflict(`The URL "${slug}" is already taken`);
    updates.slug = slug;
  }

  // Stamp the publish date the first time it goes live, and never move it after.
  if (updates.is_published === true && !post.published_at) {
    updates.published_at = new Date().toISOString();
  }

  const updated = unwrap(
    await db().from('blog_posts').update(updates).eq('id', post.id).select('*').single(),
    'update post'
  );

  res.json(camelize(updated));
});

router.delete('/:id', async (req, res) => {
  unwrap(await db().from('blog_posts').delete().eq('id', req.params.id), 'delete post');
  res.json({ success: true });
});

export default router;
