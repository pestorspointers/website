import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import User from '../models/User';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/users', async (_req: AuthRequest, res: Response): Promise<void> => {
  const users = await User.find()
    .select('-passwordHash')
    .sort({ createdAt: -1 });
  res.json(users);
});

router.patch(
  '/users/:id/role',
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-passwordHash');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  }
);

export default router;
