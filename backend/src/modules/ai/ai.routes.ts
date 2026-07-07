import { Router } from 'express';
import { requireAuth, requireVerified } from '../../common/middleware/auth.js';
import { AIController } from './ai.controller.js';

const router = Router();

router.use(requireAuth, requireVerified);

router.post('/chat', AIController.chat);
router.get('/actions/latest', AIController.getLatestActions);
router.post('/summarize-document', AIController.summarizeDocument);
router.post('/extract-concepts', AIController.extractConcepts);
router.post('/explain-concept', AIController.explainConcept);
router.post('/generate-flashcards', AIController.generateFlashcards);
router.post('/generate-quiz', AIController.generateQuiz);

export default router;
