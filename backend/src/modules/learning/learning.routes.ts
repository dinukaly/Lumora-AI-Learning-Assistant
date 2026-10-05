import { Router } from 'express';
import { requireAuth, requireVerified } from '../../common/middleware/auth.js';
import { LearningController } from './learning.controller.js';

const router = Router();

router.get('/progress', requireAuth, LearningController.getProgress);
router.get('/flashcards', requireAuth, requireVerified, LearningController.listFlashcards);
router.post('/flashcards/:id/review', requireAuth, requireVerified, LearningController.reviewFlashcard);
router.get('/quizzes', requireAuth, requireVerified, LearningController.listQuizzes);
router.get('/quizzes/:id', requireAuth, requireVerified, LearningController.getQuizById);
router.post('/quizzes/:id/submit', requireAuth, requireVerified, LearningController.submitQuiz);

export default router;
