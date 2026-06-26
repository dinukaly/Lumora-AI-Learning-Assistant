import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.js';
import { ConversationsController } from './conversations.controller.js';

const router = Router();

router.get('/', requireAuth, ConversationsController.list);
router.get('/:id', requireAuth, ConversationsController.getById);

export default router;
