import { Router } from 'express';
import { requireAuth, requireVerified } from '../../common/middleware/auth.js';
import { ConversationsController } from './conversations.controller.js';

const router = Router();

router.get('/', requireAuth, requireVerified, ConversationsController.list);
router.get('/:id', requireAuth, requireVerified, ConversationsController.getById);

export default router;
