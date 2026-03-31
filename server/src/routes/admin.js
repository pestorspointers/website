import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import User from '../models/User.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/users', async (_req, res) => {
  const users = await User.find()
    .select('-passwordHash')
    .sort({ createdAt: -1 });
  res.json(users);
});

router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }
  const target = await User.findById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.role === 'admin' && role !== 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      res.status(400).json({ error: 'At least one admin must remain' });
      return;
    }
  }
  target.role = role;
  await target.save();
  const updated = target.toObject();
  delete updated.passwordHash;
  res.json(updated);
});

export default router;
