import { Response } from 'express';
import { AuthRequest } from '../../common/middleware/auth.js';
import type { FlashcardDifficulty } from './flashcard.model.js';
import { LearningService } from './learning.service.js';

const VALID_DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);

export class LearningController {
  static async listFlashcards(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
      const documentId = req.query.documentId as string | undefined;
      const dueOnly = (req.query.dueOnly as string | undefined) === 'true';

      const result = await LearningService.listFlashcards(userId, {
        documentId,
        dueOnly,
        page,
        limit,
      });

      res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Invalid document ID') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async reviewFlashcard(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const flashcardId = req.params.id;
      const difficulty = req.body?.difficulty;

      if (typeof difficulty !== 'string' || !VALID_DIFFICULTIES.has(difficulty)) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Difficulty must be EASY, MEDIUM, or HARD' },
        });
      }

      const result = await LearningService.reviewFlashcard(
        userId,
        flashcardId,
        difficulty as FlashcardDifficulty,
      );

      res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Invalid flashcard ID') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      if (error.message === 'Flashcard not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async listQuizzes(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const documentId = req.query.documentId as string | undefined;
      const result = await LearningService.listQuizzes(userId, { documentId });
      res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Invalid document ID') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      if (error.message === 'Document not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async getQuizById(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const quizId = req.params.id;
      const result = await LearningService.getQuizById(userId, quizId);
      res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Invalid quiz ID') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      if (error.message === 'Quiz not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async submitQuiz(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const quizId = req.params.id;
      const answers = req.body?.answers;
      const result = await LearningService.submitQuiz(userId, quizId, answers);
      res.status(200).json(result);
    } catch (error: any) {
      if (
        error.message === 'Invalid quiz ID'
        || error.message === 'Answers must be an array of option indices'
        || error.message === 'Answer count must match total quiz questions'
      ) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      if (error.message === 'Quiz not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }
}
