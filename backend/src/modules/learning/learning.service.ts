import mongoose from 'mongoose';
import Flashcard, { type FlashcardDifficulty } from './flashcard.model.js';

export class LearningService {
  static async listFlashcards(userId: string, options: {
    documentId?: string;
    dueOnly?: boolean;
    page: number;
    limit: number;
  }) {
    const filter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
    };

    if (options.documentId) {
      if (!mongoose.Types.ObjectId.isValid(options.documentId)) {
        throw new Error('Invalid document ID');
      }

      filter.documentId = new mongoose.Types.ObjectId(options.documentId);
    }

    if (options.dueOnly) {
      filter.nextReviewAt = { $lte: new Date() };
    }

    const skip = (options.page - 1) * options.limit;
    const [flashcards, total] = await Promise.all([
      Flashcard.find(filter)
        .sort({ nextReviewAt: 1, createdAt: -1 })
        .skip(skip)
        .limit(options.limit)
        .lean(),
      Flashcard.countDocuments(filter),
    ]);

    return {
      flashcards: flashcards.map((card) => ({
        id: card._id.toString(),
        documentId: card.documentId.toString(),
        front: card.front,
        back: card.back,
        difficulty: card.difficulty,
        nextReviewAt: card.nextReviewAt,
        reviewCount: card.reviewCount,
        successCount: card.successCount,
      })),
      total,
      page: options.page,
      totalPages: Math.ceil(total / options.limit),
    };
  }

  static async reviewFlashcard(userId: string, flashcardId: string, difficulty: FlashcardDifficulty) {
    if (!mongoose.Types.ObjectId.isValid(flashcardId)) {
      throw new Error('Invalid flashcard ID');
    }

    const flashcard = await Flashcard.findOne({
      _id: flashcardId,
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!flashcard) {
      throw new Error('Flashcard not found');
    }

    const nextReviewAt = calculateNextReviewAt(difficulty, flashcard.reviewCount);
    flashcard.difficulty = difficulty;
    flashcard.reviewCount += 1;
    flashcard.nextReviewAt = nextReviewAt;

    if (difficulty !== 'HARD') {
      flashcard.successCount += 1;
    }

    await flashcard.save();

    return {
      id: flashcard.id,
      nextReviewAt: flashcard.nextReviewAt,
      reviewCount: flashcard.reviewCount,
      successCount: flashcard.successCount,
    };
  }
}

function calculateNextReviewAt(difficulty: FlashcardDifficulty, currentReviewCount: number) {
  const next = new Date();
  const upcomingReviewNumber = currentReviewCount + 1;

  let intervalDays = 1;
  if (difficulty === 'EASY') {
    intervalDays = Math.min(30, Math.max(3, upcomingReviewNumber * 4));
  } else if (difficulty === 'MEDIUM') {
    intervalDays = Math.min(14, Math.max(2, upcomingReviewNumber * 2));
  }

  next.setDate(next.getDate() + intervalDays);
  return next;
}
