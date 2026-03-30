import { Router } from 'express';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import Video from '../models/Video.js';
import User from '../models/User.js';
import SubscriptionTier from '../models/SubscriptionTier.js';
import { signCloudFrontUrl } from '../services/cloudfront.js';
import { submitTranscodeJob } from '../services/mediaconvert.js';
import mongoose from 'mongoose';

const router = Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ─── PUBLIC: list published videos ────────────────────────────────────────────

router.get('/', async (_req, res) => {
  const videos = await Video.find({ isPublished: true })
    .select('title description thumbnailUrl accessType duration price courseId createdAt')
    .sort({ createdAt: -1 });
  res.json(videos);
});

// ─── ADMIN: get presigned S3 PUT URL for direct browser upload ────────────────

router.post(
  '/upload-url',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const { videoId, contentType = 'video/mp4' } = req.body;

    if (!videoId) {
      res.status(400).json({ error: 'videoId is required' });
      return;
    }

    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) {
      res.status(500).json({ error: 'S3_BUCKET_NAME not configured' });
      return;
    }

    const key = `uploads/raw/${videoId}/original.mp4`;
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ uploadUrl, key });
  }
);

// ─── ADMIN: trigger MediaConvert after upload completes ───────────────────────

router.post(
  '/transcode',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const { videoId } = req.body;
    if (!videoId) {
      res.status(400).json({ error: 'videoId is required' });
      return;
    }

    const jobId = await submitTranscodeJob(videoId);
    res.json({ jobId });
  }
);

// ─── ADMIN: create video metadata record ─────────────────────────────────────

router.post(
  '/',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const { title, description, s3Key, accessType, courseId, price, thumbnailUrl, duration } =
      req.body;

    if (!title || !description || !accessType) {
      res.status(400).json({ error: 'title, description, accessType are required' });
      return;
    }

    if (accessType === 'purchase' && (price === undefined || price < 0)) {
      res.status(400).json({ error: 'price is required for purchase videos' });
      return;
    }

    const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;

    const video = await Video.create({
      title,
      description,
      s3Key,
      cloudFrontUrl: cloudFrontDomain,
      accessType,
      courseId: courseId || undefined,
      price: accessType === 'purchase' ? price : undefined,
      thumbnailUrl,
      duration,
    });

    res.status(201).json(video);
  }
);

// ─── PROTECTED: get signed CloudFront URL for streaming ──────────────────────

router.get(
  '/:id/stream',
  authenticate,
  async (req, res) => {
    const video = await Video.findById(req.params.id);
    if (!video || !video.isPublished) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const userId = req.user.id;
    const hasAccess = await checkVideoAccess(userId, video);

    if (!hasAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!video.s3Key) {
      res.status(400).json({ error: 'Video is not ready for streaming' });
      return;
    }

    const signedUrl = signCloudFrontUrl(video.s3Key);
    res.json({ url: signedUrl, expiresIn: 7200 });
  }
);

// ─── ADMIN: update video metadata ─────────────────────────────────────────────

router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const allowed = [
      'title',
      'description',
      'accessType',
      'courseId',
      'price',
      'thumbnailUrl',
      'duration',
      's3Key',
      'isPublished',
    ];

    const updateFields = {};
    for (const key of allowed) {
      if (key in req.body) {
        updateFields[key] = req.body[key];
      }
    }

    const video = await Video.findByIdAndUpdate(req.params.id, updateFields, {
      new: true,
      runValidators: true,
    });

    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    res.json(video);
  }
);

// ─── ADMIN: delete video + S3 objects ────────────────────────────────────────

router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  async (req, res) => {
    const video = await Video.findById(req.params.id);
    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const bucket = process.env.S3_BUCKET_NAME;
    if (bucket && video.s3Key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: video.s3Key }));

      const rawKey = `uploads/raw/${video._id}/original.mp4`;
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: rawKey })).catch(() => {});
    }

    await video.deleteOne();
    res.json({ success: true });
  }
);

// ─── Access control helper ────────────────────────────────────────────────────

async function checkVideoAccess(userId, video) {
  if (video.accessType === 'public') return true;

  const user = await User.findById(userId).populate('subscription.tierId');
  if (!user) return false;

  if (video.accessType === 'purchase') {
    return user.purchasedVideoIds.some((id) =>
      id.equals(video._id)
    );
  }

  if (video.accessType === 'course') {
    // Check if user purchased the course directly
    if (
      video.courseId &&
      user.purchasedCourseIds.some((id) => id.equals(video.courseId))
    ) {
      return true;
    }

    // Check if user has an active subscription whose tier unlocks this course
    if (user.subscription.status === 'active' && user.subscription.tierId) {
      const tier = await SubscriptionTier.findById(user.subscription.tierId);
      if (
        tier &&
        video.courseId &&
        tier.unlockedCourseIds.some((id) => id.equals(video.courseId))
      ) {
        return true;
      }
    }
  }

  return false;
}

export default router;
