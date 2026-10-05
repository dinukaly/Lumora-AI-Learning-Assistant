import { enqueueFlashcardGeneration } from '../../common/queue/index.js';
import { FlashcardGenerationService } from './flashcard-generation.service.js';

export class FlashcardJobService {
  static async queueGeneration(input: {
    userId: string;
    documentId: string;
    count?: number;
    topic?: string;
  }) {
    await FlashcardGenerationService.assertReadyOwnedDocument(input.documentId, input.userId);

    const normalizedCount = FlashcardGenerationService.normalizeRequestedCount(input.count);
    return enqueueFlashcardGeneration({
      userId: input.userId,
      documentId: input.documentId,
      count: normalizedCount,
      topic: input.topic?.trim() || undefined,
    });
  }
}
