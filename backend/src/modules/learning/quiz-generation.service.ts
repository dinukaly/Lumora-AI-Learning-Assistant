import mongoose from 'mongoose';
import type { IDocumentChunk } from '../documents/document-chunk.model.js';
import DocumentChunk from '../documents/document-chunk.model.js';
import Document from '../documents/document.model.js';
import { getChatProvider } from '../ai/ai.config.js';
import Quiz, { type IQuizQuestion, type QuizDifficulty } from './quiz.model.js';

interface GenerateQuizInput {
  userId: string;
  documentId: string;
  questionCount: number;
  difficulty?: QuizDifficulty;
  topic?: string;
}

interface QuizGenerationCallbacks {
  onPrepared?: () => Promise<void> | void;
  onGenerated?: () => Promise<void> | void;
  onStored?: () => Promise<void> | void;
}

interface GeneratedQuizPayload {
  title?: string;
  questions?: Array<{
    question?: string;
    options?: string[];
    correctIndex?: number;
    explanation?: string;
  }>;
}

const DEFAULT_QUESTION_COUNT = 10;
const MAX_QUESTION_COUNT = 20;

export class QuizGenerationService {
  static normalizeRequestedCount(questionCount?: number) {
    if (!questionCount || Number.isNaN(questionCount)) {
      return DEFAULT_QUESTION_COUNT;
    }

    return Math.min(MAX_QUESTION_COUNT, Math.max(1, Math.round(questionCount)));
  }

  static normalizeDifficulty(difficulty?: string): QuizDifficulty | undefined {
    if (difficulty === 'EASY' || difficulty === 'MEDIUM' || difficulty === 'HARD') {
      return difficulty;
    }

    return undefined;
  }

  static async assertReadyOwnedDocument(documentId: string, userId: string) {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      throw new Error('Invalid document ID');
    }

    const document = await Document.findOne({
      _id: documentId,
      ownerId: new mongoose.Types.ObjectId(userId),
    })
      .select('_id title summary status ownerId')
      .lean();

    if (!document) {
      throw new Error('Document not found');
    }

    if (document.status !== 'READY') {
      throw new Error('Document is not ready for quiz generation');
    }

    return document;
  }

  static async generateForDocument(
    input: GenerateQuizInput,
    callbacks: QuizGenerationCallbacks = {},
  ) {
    const document = await this.assertReadyOwnedDocument(input.documentId, input.userId);
    const selectedChunks = await this.loadGenerationChunks(input.documentId, input.topic);
    if (selectedChunks.length === 0) {
      throw new Error('No document chunks available for quiz generation');
    }

    await callbacks.onPrepared?.();

    const prompt = buildQuizPrompt({
      title: document.title,
      summary: document.summary?.text,
      count: input.questionCount,
      difficulty: input.difficulty,
      topic: input.topic,
      chunks: selectedChunks,
    });

    const response = await getChatProvider().generateJSON<GeneratedQuizPayload>(
      prompt,
      'quiz',
      {
        temperature: 0,
        maxTokens: 2600,
      },
    );

    const normalizedQuestions = normalizeGeneratedQuestions(response.questions).slice(0, input.questionCount);
    if (normalizedQuestions.length === 0) {
      throw new Error('AI did not return any usable quiz questions');
    }

    await callbacks.onGenerated?.();

    const sourceChunkIds = selectedChunks.map((chunk) => chunk._id);
    const quiz = await Quiz.create({
      documentId: new mongoose.Types.ObjectId(input.documentId),
      title: response.title?.trim() || `${document.title} Quiz`,
      questions: normalizedQuestions,
      sourceChunkIds,
      createdBy: 'AI',
      difficulty: input.difficulty,
    });

    const quizCount = await Quiz.countDocuments({
      documentId: new mongoose.Types.ObjectId(input.documentId),
    });

    await Document.findByIdAndUpdate(input.documentId, { quizCount });

    await callbacks.onStored?.();

    return {
      documentId: input.documentId,
      quizId: quiz.id,
      questionCount: quiz.questions.length,
    };
  }

  private static async loadGenerationChunks(documentId: string, topic?: string) {
    const chunks = await DocumentChunk.find({ documentId })
      .sort({ chunkIndex: 1 })
      .select('_id chunkIndex text pageNumber')
      .lean();

    if (!topic?.trim()) {
      return chunks.slice(0, 12);
    }

    const topicTokens = tokenize(topic);
    const scored = chunks
      .map((chunk) => ({
        chunk,
        score: topicTokens.reduce((total, token) => {
          const haystack = chunk.text.toLowerCase();
          return haystack.includes(token) ? total + countOccurrences(haystack, token) : total;
        }, 0),
      }))
      .sort((left, right) => right.score - left.score || left.chunk.chunkIndex - right.chunk.chunkIndex);

    const prioritized = scored.filter((item) => item.score > 0).map((item) => item.chunk).slice(0, 8);
    const fallback = chunks.filter((chunk) => !prioritized.some((item) => item._id.equals(chunk._id))).slice(0, 4);

    return [...prioritized, ...fallback].slice(0, 12);
  }
}

function buildQuizPrompt(input: {
  title: string;
  summary?: string;
  count: number;
  difficulty?: QuizDifficulty;
  topic?: string;
  chunks: Array<Pick<IDocumentChunk, '_id' | 'chunkIndex' | 'text' | 'pageNumber'>>;
}) {
  const summaryBlock = input.summary ? `[Document Summary]\n${input.summary}\n\n` : '';
  const topicBlock = input.topic?.trim() ? `[Topic Focus]\n${input.topic.trim()}\n\n` : '';
  const difficultyBlock = input.difficulty ? `[Difficulty]\n${input.difficulty}\n\n` : '';
  const chunkBlock = input.chunks
    .map(
      (chunk) =>
        `[Chunk ${chunk.chunkIndex} | Page ${chunk.pageNumber ?? 'unknown'}]\n${chunk.text}`,
    )
    .join('\n\n');

  return [
    'You are Lumora, an AI tutor generating a multiple-choice quiz from a document.',
    'Use only the provided chunks.',
    'Return strict JSON with this shape:',
    '{"title":"string","questions":[{"question":"string","options":["a","b","c","d"],"correctIndex":0,"explanation":"string"}]}',
    'Each question must have exactly 4 options and a valid correctIndex.',
    'Do not include markdown fences.',
    '',
    `[Requested Count]\n${input.count}`,
    '',
    `[Document Title]\n${input.title}`,
    '',
    summaryBlock + difficultyBlock + topicBlock + '[Source Chunks]\n' + chunkBlock,
  ].join('\n');
}

function normalizeGeneratedQuestions(
  questions: GeneratedQuizPayload['questions'],
) {
  if (!Array.isArray(questions)) {
    return [];
  }

  const normalized: IQuizQuestion[] = [];

  for (const question of questions) {
    const prompt = typeof question.question === 'string' ? question.question.trim() : '';
    const options = Array.isArray(question.options)
      ? question.options.map((option) => option.trim()).filter(Boolean)
      : [];
    const correctIndex = typeof question.correctIndex === 'number'
      ? Math.round(question.correctIndex)
      : -1;

    if (!prompt || options.length !== 4 || correctIndex < 0 || correctIndex >= options.length) {
      continue;
    }

    normalized.push({
      question: prompt,
      options,
      correctIndex,
      explanation: typeof question.explanation === 'string' && question.explanation.trim()
        ? question.explanation.trim()
        : undefined,
    });
  }

  return normalized;
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((token) => token.length >= 3),
    ),
  );
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}
