import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { camelize, pickSnake } from '../lib/case.js';
import { assertUuids, badRequest, notFound } from '../lib/http.js';

const router = Router();

/**
 * The CMS. A page is an ordered list of typed blocks whose `content` is JSON,
 * which is what lets the site owner restructure a page — add a section, drop an
 * image, reword a headline — without a deploy.
 *
 * The block types the client knows how to render live in
 * `client/lib/blocks.js`. Adding a type means adding it there and in the
 * renderer; this API stores whatever it's given.
 */

const PAGE_COLUMNS =
  'id, slug, title, meta_title, meta_description, is_published, is_system, updated_at';

const byPosition = (a, b) => a.position - b.position;

// ─── ADMIN listings (declared before /:slug) ─────────────────────────────────

router.get('/admin/all', authenticate, requireAdmin, async (_req, res) => {
  const rows = unwrap(
    await db()
      .from('pages')
      .select(`${PAGE_COLUMNS}, page_blocks(count)`)
      .order('slug', { ascending: true }),
    'list pages'
  );

  res.json(
    rows.map((row) => ({
      ...camelize(row),
      pageBlocks: undefined,
      blockCount: row.page_blocks?.[0]?.count ?? 0,
    }))
  );
});

router.get('/admin/:slug', authenticate, requireAdmin, async (req, res) => {
  const row = unwrap(
    await db()
      .from('pages')
      .select(`${PAGE_COLUMNS}, page_blocks(id, type, position, is_visible, content)`)
      .eq('slug', req.params.slug)
      .maybeSingle(),
    'load page'
  );
  if (!row) throw notFound('Page not found');

  res.json({
    ...camelize({ ...row, page_blocks: undefined }),
    blocks: (row.page_blocks ?? []).sort(byPosition).map(camelize),
  });
});

// ─── PUBLIC: render a page ───────────────────────────────────────────────────

router.get('/:slug', async (req, res) => {
  const row = unwrap(
    await db()
      .from('pages')
      .select(`${PAGE_COLUMNS}, page_blocks(id, type, position, is_visible, content)`)
      .eq('slug', req.params.slug)
      .eq('is_published', true)
      .maybeSingle(),
    'load page'
  );
  if (!row) throw notFound('Page not found');

  res.json({
    ...camelize({ ...row, page_blocks: undefined }),
    blocks: (row.page_blocks ?? [])
      .filter((b) => b.is_visible)
      .sort(byPosition)
      .map(camelize),
  });
});

// ─── ADMIN writes ────────────────────────────────────────────────────────────

router.use(authenticate, requireAdmin);

router.patch('/:id', async (req, res) => {
  const updates = pickSnake(req.body, [
    'title',
    'metaTitle',
    'metaDescription',
    'isPublished',
  ]);

  const page = unwrap(
    await db().from('pages').update(updates).eq('id', req.params.id).select(PAGE_COLUMNS).maybeSingle(),
    'update page'
  );
  if (!page) throw notFound('Page not found');

  res.json(camelize(page));
});

// Add a section. New blocks land at the bottom of the page.
router.post('/:id/blocks', async (req, res) => {
  const { type, content = {} } = req.body;
  if (!type) throw badRequest('A block type is required');

  const page = unwrap(
    await db().from('pages').select('id').eq('id', req.params.id).maybeSingle(),
    'load page'
  );
  if (!page) throw notFound('Page not found');

  const { count } = await db()
    .from('page_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('page_id', page.id);

  const block = unwrap(
    await db()
      .from('page_blocks')
      .insert({ page_id: page.id, type, content, position: count ?? 0 })
      .select('id, type, position, is_visible, content')
      .single(),
    'create block'
  );

  res.status(201).json(camelize(block));
});

router.patch('/blocks/:blockId', async (req, res) => {
  const updates = pickSnake(req.body, ['content', 'isVisible', 'type']);

  const block = unwrap(
    await db()
      .from('page_blocks')
      .update(updates)
      .eq('id', req.params.blockId)
      .select('id, type, position, is_visible, content')
      .maybeSingle(),
    'update block'
  );
  if (!block) throw notFound('Block not found');

  res.json(camelize(block));
});

// Reorder: the submitted array is the new top-to-bottom order.
router.put('/:id/blocks/order', async (req, res) => {
  const { blockIds } = req.body;
  if (!Array.isArray(blockIds)) throw badRequest('blockIds must be an array');
  assertUuids(blockIds, 'block id');

  for (const [position, blockId] of blockIds.entries()) {
    unwrap(
      await db()
        .from('page_blocks')
        .update({ position })
        .eq('id', blockId)
        .eq('page_id', req.params.id),
      'reorder blocks'
    );
  }

  res.json({ success: true });
});

router.delete('/blocks/:blockId', async (req, res) => {
  unwrap(
    await db().from('page_blocks').delete().eq('id', req.params.blockId),
    'delete block'
  );
  res.json({ success: true });
});

export default router;
