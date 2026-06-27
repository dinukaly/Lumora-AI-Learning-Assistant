import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.js';
import { LearningController } from './learning.controller.js';

const router = Router();

router.get('/flashcards', requireAuth, LearningController.listFlashcards);
router.post('/flashcards/:id/review', requireAuth, LearningController.reviewFlashcard);

export default router;
