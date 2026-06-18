import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.js';
import { UsersController } from './users.controller.js';

const router = Router();

router.get('/me', requireAuth, UsersController.getProfile);
router.patch('/me', requireAuth, UsersController.updateProfile);
router.patch('/me/password', requireAuth, UsersController.changePassword);

export default router;