import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { badRequest } from '../lib/http.js';

const router = Router();

/**
 * Global site config — brand, nav links, footer, socials. Public to read
 * (the nav has to render for logged-out visitors), admin-only to write.
 *
 * `admin_emails` is deliberately excluded from the public payload: it isn't
 * secret, but there's no reason to advertise which addresses get admin.
 */

const PRIVATE_KEYS = new Set(['admin_emails']);

router.get('/', async (_req, res) => {
  const rows = unwrap(await db().from('site_settings').select('key, value'), 'load settings');

  const settings = {};
  for (const row of rows) {
    if (!PRIVATE_KEYS.has(row.key)) settings[row.key] = row.value;
  }

  res.json(settings);
});

router.get('/admin/all', authenticate, requireAdmin, async (_req, res) => {
  const rows = unwrap(await db().from('site_settings').select('key, value'), 'load settings');

  const settings = {};
  for (const row of rows) settings[row.key] = row.value;

  res.json(settings);
});

router.put('/:key', authenticate, requireAdmin, async (req, res) => {
  const { value } = req.body;
  if (value === undefined) throw badRequest('value is required');

  const row = unwrap(
    await db()
      .from('site_settings')
      .upsert({ key: req.params.key, value }, { onConflict: 'key' })
      .select('key, value')
      .single(),
    'save setting'
  );

  res.json(row);
});

export default router;
