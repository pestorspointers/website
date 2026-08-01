import { Router } from 'express';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db, unwrap } from '../config/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { camelize, pickSnake } from '../lib/case.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { canAccessVideo } from '../services/access.js';
import { signCloudFrontUrl } from '../services/cloudfront.js';
import { submitTranscodeJob, getTranscodeJobStatus, hlsKeyFor } from '../services/mediaconvert.js';

const router = Router();

const VIDEO_COLUMNS =
  'id, title, description, s3_key, thumbnail_url, duration_seconds, access_type, course_id, position, price, is_published, transcode_status, transcode_job_id, created_at, updated_at';

let _s3;
function s3() {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return _s3;
}

function bucket() {
  const name = process.env.S3_BUCKET_NAME;
  if (!name) throw new Error('S3_BUCKET_NAME is not configured');
  return name;
}

// ─── PUBLIC: free/marketing clips only ───────────────────────────────────────

router.get('/', async (_req, res) => {
  const rows = unwrap(
    await db()
      .from('videos')
      .select('id, title, description, thumbnail_url, duration_seconds, course_id, created_at')
      .eq('is_published', true)
      .eq('access_type', 'public')
      .order('created_at', { ascending: false }),
    'list public videos'
  );

  res.json(camelize(rows));
});

// ─── ADMIN: library ──────────────────────────────────────────────────────────

router.get('/admin/all', authenticate, requireAdmin, async (req, res) => {
  let query = db()
    .from('videos')
    .select(`${VIDEO_COLUMNS}, courses(title, slug)`)
    .order('created_at', { ascending: false });

  if (req.query.courseId) query = query.eq('course_id', req.query.courseId);
  if (req.query.unassigned === 'true') query = query.is('course_id', null);

  const rows = unwrap(await query, 'list videos');

  res.json(
    rows.map((row) => ({
      ...camelize(row),
      courses: undefined,
      courseTitle: row.courses?.title ?? null,
    }))
  );
});

// ─── PROTECTED: the actual gate ──────────────────────────────────────────────
//  Returns a CloudFront URL signed for two hours. This is the only place a
//  playable video address is ever produced, so this access check is the single
//  thing standing between a paying customer and a freeloader.

router.get('/:id/stream', authenticate, async (req, res) => {
  const video = unwrap(
    await db()
      .from('videos')
      .select('id, s3_key, access_type, course_id, is_published, transcode_status')
      .eq('id', req.params.id)
      .maybeSingle(),
    'load video'
  );

  if (!video || !video.is_published) throw notFound('Video not found');

  if (!(await canAccessVideo(req.user, video))) {
    throw forbidden('You do not have access to this video');
  }

  if (!video.s3_key || video.transcode_status !== 'ready') {
    throw badRequest('This video is still processing. Check back shortly.');
  }

  const expiresIn = 7200;
  res.json({ url: signCloudFrontUrl(video.s3_key, expiresIn), expiresIn });
});

// Lets the watch page decide what to render before it asks for a stream.
router.get('/:id/access', authenticate, async (req, res) => {
  const video = unwrap(
    await db()
      .from('videos')
      .select('id, title, description, access_type, course_id, is_published, transcode_status, courses(title, slug)')
      .eq('id', req.params.id)
      .maybeSingle(),
    'load video'
  );

  if (!video || !video.is_published) throw notFound('Video not found');

  res.json({
    ...camelize({ ...video, courses: undefined }),
    courseTitle: video.courses?.title ?? null,
    courseSlug: video.courses?.slug ?? null,
    hasAccess: await canAccessVideo(req.user, video),
  });
});

// ─── ADMIN: write operations ─────────────────────────────────────────────────

router.use(authenticate, requireAdmin);

router.post('/', async (req, res) => {
  const { title, accessType = 'course' } = req.body;
  if (!title) throw badRequest('title is required');

  if (accessType === 'course' && !req.body.courseId) {
    throw badRequest('Pick a course for this video, or set it to a public clip');
  }
  if (accessType === 'purchase' && !(Number(req.body.price) > 0)) {
    throw badRequest('Set a price for a video sold on its own');
  }

  const insert = pickSnake(req.body, [
    'title',
    'description',
    'thumbnailUrl',
    'accessType',
    'courseId',
    'price',
    'durationSeconds',
    'position',
  ]);

  // A video sold on its own isn't part of a course, whatever was submitted.
  if (accessType === 'purchase') insert.course_id = null;

  // Land new videos at the end of their course.
  if (insert.course_id && insert.position === undefined) {
    const { count } = await db()
      .from('videos')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', insert.course_id);
    insert.position = count ?? 0;
  }

  const video = unwrap(
    await db().from('videos').insert(insert).select(VIDEO_COLUMNS).single(),
    'create video'
  );

  res.status(201).json(camelize(video));
});

// Step 1 of upload: a presigned PUT straight to the private bucket, so the
// file never passes through this server.
router.post('/:id/upload-url', async (req, res) => {
  const { contentType = 'video/mp4' } = req.body;

  const video = unwrap(
    await db().from('videos').select('id').eq('id', req.params.id).maybeSingle(),
    'load video'
  );
  if (!video) throw notFound('Video not found');

  const key = `uploads/raw/${video.id}/original.mp4`;
  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: 3600 }
  );

  res.json({ uploadUrl, key });
});

// Step 2: hand the raw upload to MediaConvert and remember where the HLS
// manifest will appear.
router.post('/:id/transcode', async (req, res) => {
  const video = unwrap(
    await db().from('videos').select('id').eq('id', req.params.id).maybeSingle(),
    'load video'
  );
  if (!video) throw notFound('Video not found');

  const jobId = await submitTranscodeJob(video.id);

  const updated = unwrap(
    await db()
      .from('videos')
      .update({
        transcode_status: 'processing',
        transcode_job_id: jobId,
        s3_key: hlsKeyFor(video.id),
      })
      .eq('id', video.id)
      .select(VIDEO_COLUMNS)
      .single(),
    'save transcode job'
  );

  res.json(camelize(updated));
});

// Step 3: the admin UI polls this until it says ready.
router.get('/:id/transcode-status', async (req, res) => {
  const video = unwrap(
    await db()
      .from('videos')
      .select('id, transcode_status, transcode_job_id')
      .eq('id', req.params.id)
      .maybeSingle(),
    'load video'
  );
  if (!video) throw notFound('Video not found');

  if (!video.transcode_job_id || video.transcode_status === 'ready') {
    return res.json({ status: video.transcode_status });
  }

  const { status, error } = await getTranscodeJobStatus(video.transcode_job_id);

  if (status !== video.transcode_status) {
    unwrap(
      await db().from('videos').update({ transcode_status: status }).eq('id', video.id),
      'update transcode status'
    );
  }

  res.json({ status, error });
});

router.patch('/:id', async (req, res) => {
  const updates = pickSnake(req.body, [
    'title',
    'description',
    'thumbnailUrl',
    'accessType',
    'courseId',
    'price',
    'durationSeconds',
    'position',
    'isPublished',
  ]);

  const current = unwrap(
    await db().from('videos').select('access_type, course_id').eq('id', req.params.id).maybeSingle(),
    'load video'
  );
  if (!current) throw notFound('Video not found');

  const accessType = updates.access_type ?? current.access_type;
  const courseId = 'course_id' in updates ? updates.course_id : current.course_id;

  if (accessType === 'course' && !courseId) {
    throw badRequest('A course video must belong to a course');
  }
  // A public clip shouldn't sit inside a paid course's video list.
  if (accessType === 'purchase') updates.course_id = null;

  const video = unwrap(
    await db().from('videos').update(updates).eq('id', req.params.id).select(VIDEO_COLUMNS).single(),
    'update video'
  );

  res.json(camelize(video));
});

router.delete('/:id', async (req, res) => {
  const video = unwrap(
    await db().from('videos').select('id, s3_key').eq('id', req.params.id).maybeSingle(),
    'load video'
  );
  if (!video) throw notFound('Video not found');

  if (process.env.S3_BUCKET_NAME) {
    // Transcoding fans one upload out into dozens of segment files, so clear
    // the whole prefix rather than just the manifest.
    await deletePrefix(`videos/hls/${video.id}/`).catch(() => {});
    await s3()
      .send(
        new DeleteObjectCommand({
          Bucket: bucket(),
          Key: `uploads/raw/${video.id}/original.mp4`,
        })
      )
      .catch(() => {});
  }

  unwrap(await db().from('videos').delete().eq('id', video.id), 'delete video');
  res.json({ success: true });
});

async function deletePrefix(prefix) {
  let token;
  do {
    const listed = await s3().send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token })
    );

    const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key }));
    if (keys.length) {
      await s3().send(
        new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys } })
      );
    }

    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}

export default router;
