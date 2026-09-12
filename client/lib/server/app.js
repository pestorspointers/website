/**
 * The API, assembled. This is what `server/src/index.js` used to do, minus the
 * bits that only made sense for a long-lived Express process.
 *
 * What changed when the API moved inside Next.js on Amplify:
 *
 * • No `cors()`. The API is served from the same origin as the site now, so
 *   there is no cross-origin request to allow and no CLIENT_URL list to keep in
 *   sync. `CLIENT_URL` is still read elsewhere for building invite links.
 * • No `helmet()`. Response headers belong to the Next server; set them in
 *   `next.config.js` if you want to harden them.
 * • No `express-rate-limit`. It counts requests in the memory of one process,
 *   and Amplify's compute is many short-lived ones, so it would have limited
 *   nothing while appearing to. Rate limiting has to live in front of the app
 *   (CloudFront/WAF) to mean anything here.
 * • No `express.json()` / `express.raw()`. The route handler parses the body,
 *   and keeps it raw for Stripe webhooks — see `WEBHOOK_PATH`.
 */

import { Router } from './router.js';
import { supabaseUrl } from './config/supabase.js';
import { stripeEnabled } from './services/stripe.js';

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import subscriptionTierRoutes from './routes/subscriptionTiers.js';
import paymentsRoutes from './routes/payments.js';
import webhooksRoutes from './routes/webhooks.js';
import videosRoutes from './routes/videos.js';
import coursesRoutes from './routes/courses.js';
import blogRoutes from './routes/blog.js';
import pagesRoutes from './routes/pages.js';
import mediaRoutes from './routes/media.js';
import settingsRoutes from './routes/settings.js';

/** Stripe verifies a signature over the exact bytes it sent, so this one path
 *  must not have its body parsed. */
export const WEBHOOK_PREFIX = '/api/v1/webhooks';

const app = Router();

app.use(WEBHOOK_PREFIX, webhooksRoutes);

app.use('/api/v1/auth', authRoutes);
// Registered before /api/v1/admin so the more specific mount wins, as it did
// in the Express app.
app.use('/api/v1/admin/subscription-tiers', subscriptionTierRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/videos', videosRoutes);
app.use('/api/v1/courses', coursesRoutes);
app.use('/api/v1/blog', blogRoutes);
app.use('/api/v1/pages', pagesRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/settings', settingsRoutes);

/**
 * Liveness plus a configuration read-out. It reports only whether each group of
 * variables is present, never a value, and it is the fastest way to tell a
 * broken deploy from a missing setting — the distinction that is otherwise
 * invisible, because a missing secret surfaces as a generic 500.
 */
app.get('/api/v1/health', (_req, res) =>
  res.json({
    status: 'ok',
    configured: {
      supabase: Boolean(
        supabaseUrl() &&
          (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)
      ),
      stripe: stripeEnabled(),
      stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      s3: Boolean(
        process.env.S3_BUCKET_NAME && (process.env.APP_AWS_REGION || process.env.AWS_REGION)
      ),
      cloudfront: Boolean(
        process.env.CLOUDFRONT_DOMAIN &&
          process.env.CLOUDFRONT_KEY_PAIR_ID &&
          process.env.CLOUDFRONT_PRIVATE_KEY
      ),
      mediaconvert: Boolean(
        process.env.MEDIACONVERT_ENDPOINT && process.env.MEDIACONVERT_ROLE_ARN
      ),
    },
  })
);

export default app;
