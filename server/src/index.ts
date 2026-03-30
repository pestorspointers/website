import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './config/db';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import subscriptionTierRoutes from './routes/subscriptionTiers';
import paymentsRoutes from './routes/payments';
import webhooksRoutes from './routes/webhooks';
import videosRoutes from './routes/videos';
import coursesRoutes from './routes/courses';
import blogRoutes from './routes/blog';

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

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
);

const PORT = process.env.PORT || 5001;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

export default app;
