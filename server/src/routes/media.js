import { Router } from 'express';
import { db, unwrap } from '../config/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { camelize } from '../lib/case.js';
import { badRequest, notFound } from '../lib/http.js';

const router = Router();

/**
 * The image library behind the page builder.
 *
 * Files go browser → Supabase Storage directly (RLS lets admins write to the
 * `media` bucket), then the browser posts the resulting path here so the image
 * shows up in the picker. Keeping the bytes off this server means uploads
 * aren't bounded by the API's request size limit.
 *
 * Course video does NOT live here — that's the private S3 bucket, reachable
 * only through signed CloudFront URLs.
 */

router.use(authenticate, requireAdmin);

router.get('/', async (_req, res) => {
  const rows = unwrap(
    await db().from('media').select('*').order('created_at', { ascending: false }).limit(500),
    'list media'
  );
  res.json(camelize(rows));
});

router.post('/', async (req, res) => {
  const { storagePath, url, filename, mimeType, sizeBytes, altText } = req.body;

  if (!storagePath || !url || !filename) {
    throw badRequest('storagePath, url and filename are required');
  }

  const row = unwrap(
    await db()
      .from('media')
      .upsert(
        {
          storage_path: storagePath,
          url,
          filename,
          mime_type: mimeType ?? null,
          size_bytes: sizeBytes ?? null,
          alt_text: altText ?? null,
          uploaded_by: req.user.id,
        },
        { onConflict: 'storage_path' }
      )
      .select('*')
      .single(),
    'record media'
  );

  res.status(201).json(camelize(row));
});

router.patch('/:id', async (req, res) => {
  const { altText } = req.body;

  const row = unwrap(
    await db()
      .from('media')
      .update({ alt_text: altText ?? null })
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle(),
    'update media'
  );
  if (!row) throw notFound('Image not found');

  res.json(camelize(row));
});

router.delete('/:id', async (req, res) => {
  const row = unwrap(
    await db().from('media').select('id, storage_path').eq('id', req.params.id).maybeSingle(),
    'load media'
  );
  if (!row) throw notFound('Image not found');

  const { error } = await db().storage.from('media').remove([row.storage_path]);
  if (error) console.error('Could not remove storage object:', error.message);

  unwrap(await db().from('media').delete().eq('id', row.id), 'delete media');
  res.json({ success: true });
});

export default router;
