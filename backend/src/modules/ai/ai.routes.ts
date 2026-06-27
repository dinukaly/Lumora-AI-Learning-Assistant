import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.js';
import { AIController } from './ai.controller.js';

const router = Router();

router.post('/chat', requireAuth, AIController.chat);
router.post('/generate-flashcards', requireAuth, AIController.generateFlashcards);

export default router;
