import { Router } from 'express';
import { requireAuth, AuthRequest } from '../../common/middleware/auth.js';
import User from './user.model.js';

const router = Router();

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user?.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
});

export default router;
