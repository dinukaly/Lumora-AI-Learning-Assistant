import mongoose from 'mongoose';
import Flashcard, { type FlashcardDifficulty } from './flashcard.model.js';
import Quiz from './quiz.model.js';
import QuizAttempt from './quiz-attempt.model.js';
import Document from '../documents/document.model.js';
import Conversation from '../conversations/conversation.model.js';
import Message from '../conversations/message.model.js';

export class LearningService {
  static async getProgress(userId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const now = new Date();

    const ownedDocuments = await Document.find({ ownerId: userObjectId }).select('_id').lean();
    const documentIds = ownedDocuments.map((document) => document._id);

    const [
      totalDocuments,
      documentsReady,
      totalFlashcards,
      flashcardsDue,
      flashcardReviewAggregate,
      totalQuizzes,
      quizzesCompleted,
      averageQuizScoreAggregate,
      ownedConversations,
    ] = await Promise.all([
      Document.countDocuments({ ownerId: userObjectId }),
      Document.countDocuments({ ownerId: userObjectId, status: 'READY' }),
      Flashcard.countDocuments({ userId: userObjectId }),
      Flashcard.countDocuments({
        userId: userObjectId,
        nextReviewAt: { $lte: now },
      }),
      Flashcard.aggregate<{ _id: null; totalReviewed: number }>([
        { $match: { userId: userObjectId } },
        { $group: { _id: null, totalReviewed: { $sum: '$reviewCount' } } },
      ]),
      documentIds.length > 0
        ? Quiz.countDocuments({ documentId: { $in: documentIds } })
        : Promise.resolve(0),
      QuizAttempt.countDocuments({ userId: userObjectId }),
      QuizAttempt.aggregate<{ _id: null; averageScore: number }>([
        { $match: { userId: userObjectId } },
        {
          $project: {
            percentageScore: {
              $cond: [
                { $gt: ['$totalQuestions', 0] },
                { $multiply: [{ $divide: ['$score', '$totalQuestions'] }, 100] },
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            averageScore: { $avg: '$percentageScore' },
          },
        },
      ]),
      Conversation.find({ userId: userObjectId }).select('_id').lean(),
    ]);

    const conversationIds = ownedConversations.map((conversation) => conversation._id);
    const totalChatMessages = conversationIds.length > 0
      ? await Message.countDocuments({
        conversationId: { $in: conversationIds },
        role: { $in: ['user', 'assistant'] },
      })
      : 0;

    return {
      totalDocuments,
      documentsReady,
      totalFlashcards,
      flashcardsDue,
      flashcardsReviewed: flashcardReviewAggregate[0]?.totalReviewed ?? 0,
      totalQuizzes,
      quizzesCompleted,
      averageQuizScore: Number((averageQuizScoreAggregate[0]?.averageScore ?? 0).toFixed(2)),
      totalChatMessages,
    };
  }

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

  static async listQuizzes(userId: string, options: { documentId?: string }) {
    const filter: Record<string, unknown> = {};

    if (options.documentId) {
      if (!mongoose.Types.ObjectId.isValid(options.documentId)) {
        throw new Error('Invalid document ID');
      }

      const ownedDocument = await Document.findOne({
        _id: options.documentId,
        ownerId: new mongoose.Types.ObjectId(userId),
      })
        .select('_id')
        .lean();

      if (!ownedDocument) {
        throw new Error('Document not found');
      }

      filter.documentId = ownedDocument._id;
    } else {
      const ownedDocumentIds = await Document.find({
        ownerId: new mongoose.Types.ObjectId(userId),
      })
        .select('_id')
        .lean();

      filter.documentId = {
        $in: ownedDocumentIds.map((document) => document._id),
      };
    }

    const quizzes = await Quiz.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    const attempts = await QuizAttempt.find({
      userId: new mongoose.Types.ObjectId(userId),
      quizId: { $in: quizzes.map((quiz) => quiz._id) },
    })
      .sort({ completedAt: -1 })
      .lean();

    const latestAttemptByQuizId = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      const key = attempt.quizId.toString();
      if (!latestAttemptByQuizId.has(key)) {
        latestAttemptByQuizId.set(key, attempt);
      }
    }

    return {
      quizzes: quizzes.map((quiz) => {
        const latestAttempt = latestAttemptByQuizId.get(quiz._id.toString());
        return {
          id: quiz._id.toString(),
          documentId: quiz.documentId.toString(),
          title: quiz.title,
          questionCount: quiz.questions.length,
          createdBy: quiz.createdBy,
          createdAt: quiz.createdAt,
          latestScore: latestAttempt?.score,
          latestTotalQuestions: latestAttempt?.totalQuestions,
          latestCompletedAt: latestAttempt?.completedAt,
        };
      }),
    };
  }

  static async getQuizById(userId: string, quizId: string) {
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      throw new Error('Invalid quiz ID');
    }

    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    const ownsDocument = await Document.exists({
      _id: quiz.documentId,
      ownerId: new mongoose.Types.ObjectId(userId),
    });
    if (!ownsDocument) {
      throw new Error('Quiz not found');
    }

    return {
      id: quiz._id.toString(),
      documentId: quiz.documentId.toString(),
      title: quiz.title,
      questions: quiz.questions.map((question, index) => ({
        id: index,
        question: question.question,
        options: question.options,
      })),
      createdBy: quiz.createdBy,
      createdAt: quiz.createdAt,
    };
  }

  static async submitQuiz(userId: string, quizId: string, answers: number[]) {
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      throw new Error('Invalid quiz ID');
    }

    if (!Array.isArray(answers) || answers.some((answer) => !Number.isInteger(answer) || answer < 0)) {
      throw new Error('Answers must be an array of option indices');
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      throw new Error('Quiz not found');
    }

    const ownsDocument = await Document.exists({
      _id: quiz.documentId,
      ownerId: new mongoose.Types.ObjectId(userId),
    });
    if (!ownsDocument) {
      throw new Error('Quiz not found');
    }

    if (answers.length !== quiz.questions.length) {
      throw new Error('Answer count must match total quiz questions');
    }

    const results = quiz.questions.map((question, questionIndex) => {
      const selected = answers[questionIndex];
      const correct = question.correctIndex;
      return {
        questionIndex,
        selected,
        correct,
        explanation: question.explanation,
        isCorrect: selected === correct,
      };
    });

    const score = results.filter((result) => result.isCorrect).length;
    const attempt = await QuizAttempt.create({
      userId: new mongoose.Types.ObjectId(userId),
      quizId: quiz._id,
      answers,
      score,
      totalQuestions: quiz.questions.length,
      completedAt: new Date(),
    });

    return {
      attemptId: attempt.id,
      score,
      totalQuestions: quiz.questions.length,
      results: results.map((result) => ({
        questionIndex: result.questionIndex,
        selected: result.selected,
        correct: result.correct,
        explanation: result.explanation,
      })),
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
