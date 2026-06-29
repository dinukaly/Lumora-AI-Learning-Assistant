import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.js';
import { LearningController } from './learning.controller.js';

const router = Router();

router.get('/progress', requireAuth, LearningController.getProgress);
router.get('/flashcards', requireAuth, LearningController.listFlashcards);
router.post('/flashcards/:id/review', requireAuth, LearningController.reviewFlashcard);
router.get('/quizzes', requireAuth, LearningController.listQuizzes);
router.get('/quizzes/:id', requireAuth, LearningController.getQuizById);
router.post('/quizzes/:id/submit', requireAuth, LearningController.submitQuiz);

export default router;
