import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth.js';
import { AIController } from './ai.controller.js';

const router = Router();

router.post('/chat', requireAuth, AIController.chat);
router.get('/actions/latest', requireAuth, AIController.getLatestActions);
router.post('/summarize-document', requireAuth, AIController.summarizeDocument);
router.post('/extract-concepts', requireAuth, AIController.extractConcepts);
router.post('/generate-flashcards', requireAuth, AIController.generateFlashcards);
router.post('/generate-quiz', requireAuth, AIController.generateQuiz);

export default router;
