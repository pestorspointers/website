import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import subscriptionTierRoutes from './routes/subscriptionTiers.js';
import paymentsRoutes from './routes/payments.js';
import webhooksRoutes from './routes/webhooks.js';
import videosRoutes from './routes/videos.js';
import coursesRoutes from './routes/courses.js';
import blogRoutes from './routes/blog.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/', limiter);

// Stripe webhooks require raw body for signature verification — must come BEFORE express.json()
app.use(
  '/api/v1/webhooks',
  express.raw({ type: 'application/json' }),
  webhooksRoutes
);

app.use(express.json());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/subscription-tiers', subscriptionTierRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/videos', videosRoutes);
app.use('/api/v1/courses', coursesRoutes);
app.use('/api/v1/blog', blogRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5001;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

export default app;
