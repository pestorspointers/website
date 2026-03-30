import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import BlogPost from '../models/BlogPost.js';

const router = Router();

// ─── PUBLIC ───────────────────────────────────────────────────────────────────

// List published posts, paginated. Optionally filter by ?tag=
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const tag = req.query.tag;

  const filter = { isPublished: true };
  if (tag) filter.tags = tag;

  const [posts, total] = await Promise.all([
    BlogPost.find(filter)
      .select('slug title excerpt author tags coverImageUrl publishedAt createdAt')
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    BlogPost.countDocuments(filter),
  ]);

  res.json({ posts, total, page, pages: Math.ceil(total / limit) });
});

// Single published post by slug — must come AFTER /admin/all to avoid slug conflict
router.get('/:slug', async (req, res) => {
  const post = await BlogPost.findOne({ slug: req.params.slug, isPublished: true });
  if (!post) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }
  res.json(post);
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────

router.use(authenticate, requireAdmin);

// List all posts including drafts
router.get('/admin/all', async (_req, res) => {
  const posts = await BlogPost.find()
    .select('slug title excerpt author tags isPublished publishedAt createdAt')
    .sort({ createdAt: -1 });
  res.json(posts);
});

// Create post
router.post('/', async (req, res) => {
  const { title, slug: rawSlug, mdxContent, excerpt, author, tags, coverImageUrl, isPublished } =
    req.body;

  if (!title || !mdxContent || !excerpt || !author) {
    res.status(400).json({ error: 'title, mdxContent, excerpt, and author are required' });
    return;
  }

  const slug = rawSlug || slugify(title);
  const existing = await BlogPost.findOne({ slug });
  if (existing) {
    res.status(409).json({ error: `Slug "${slug}" already exists` });
    return;
  }

  const post = await BlogPost.create({
    slug,
    title,
    mdxContent,
    excerpt,
    author,
    tags: tags || [],
    coverImageUrl,
    isPublished: isPublished ?? false,
    publishedAt: isPublished ? new Date() : undefined,
  });

  res.status(201).json(post);
});

// Update post
router.patch('/:id', async (req, res) => {
  const allowed = [
    'title', 'slug', 'mdxContent', 'excerpt', 'author',
    'tags', 'coverImageUrl', 'isPublished',
  ];
  const updateFields = {};
  for (const key of allowed) {
    if (key in req.body) updateFields[key] = req.body[key];
  }

  const post = await BlogPost.findById(req.params.id);
  if (!post) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }

  // Set publishedAt the first time a post is published
  if (updateFields.isPublished === true && !post.isPublished && !post.publishedAt) {
    updateFields.publishedAt = new Date();
  }

  const updated = await BlogPost.findByIdAndUpdate(req.params.id, updateFields, {
    new: true,
    runValidators: true,
  });

  res.json(updated);
});

// Delete post
router.delete('/:id', async (req, res) => {
  const post = await BlogPost.findByIdAndDelete(req.params.id);
  if (!post) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }
  res.json({ success: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default router;
