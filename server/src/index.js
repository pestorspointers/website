import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

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

dotenv.config();

const app = express();

app.set('trust proxy', 1);
app.use(helmet());

const allowedOrigins = (process.env.CLIENT_URL ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Server-to-server calls (Next.js SSR, curl) send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
  })
);

// Stripe webhooks need the raw body for signature verification, so they are
// mounted before express.json() and skip the rate limiter. Do not reorder.
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }), webhooksRoutes);

app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin/subscription-tiers', subscriptionTierRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/videos', videosRoutes);
app.use('/api/v1/courses', coursesRoutes);
app.use('/api/v1/blog', blogRoutes);
app.use('/api/v1/pages', pagesRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/settings', settingsRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Errors thrown anywhere in a route land here — HttpError carries its own
// status, anything else is a genuine bug and becomes a 500.
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

export default app;
