import { enqueueQuizGeneration } from '../../common/queue/index.js';
import { QuizGenerationService } from './quiz-generation.service.js';

export class QuizJobService {
  static async queueGeneration(input: {
    userId: string;
    documentId: string;
    questionCount?: number;
    difficulty?: string;
    topic?: string;
  }) {
    await QuizGenerationService.assertReadyOwnedDocument(input.documentId, input.userId);

    const normalizedQuestionCount = QuizGenerationService.normalizeRequestedCount(input.questionCount);
    const normalizedDifficulty = QuizGenerationService.normalizeDifficulty(input.difficulty);

    return enqueueQuizGeneration({
      userId: input.userId,
      documentId: input.documentId,
      questionCount: normalizedQuestionCount,
      difficulty: normalizedDifficulty,
      topic: input.topic?.trim() || undefined,
    });
  }
}
