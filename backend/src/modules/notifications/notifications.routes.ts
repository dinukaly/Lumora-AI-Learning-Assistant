import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.js';
import { NotificationsController } from './notifications.controller.js';

const router = Router();

router.get('/', requireAuth, NotificationsController.list);
router.patch('/read-all', requireAuth, NotificationsController.markAllRead);
router.patch('/:id/read', requireAuth, NotificationsController.markRead);

export default router;
