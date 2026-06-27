import mongoose from 'mongoose';
import Document from '../documents/document.model.js';
import DocumentChunk, { type IDocumentChunk } from '../documents/document-chunk.model.js';
import Flashcard, { type FlashcardDifficulty } from './flashcard.model.js';
import { getChatProvider } from '../ai/ai.config.js';

interface GenerateFlashcardsInput {
  userId: string;
  documentId: string;
  count: number;
  topic?: string;
}

interface FlashcardGenerationCallbacks {
  onPrepared?: () => Promise<void> | void;
  onGenerated?: () => Promise<void> | void;
  onStored?: () => Promise<void> | void;
}

interface GeneratedFlashcardPayload {
  front: string;
  back: string;
  difficulty?: FlashcardDifficulty;
  sourceChunkIndex?: number;
}

interface GeneratedFlashcardResponse {
  flashcards: GeneratedFlashcardPayload[];
}

const DEFAULT_FLASHCARD_COUNT = 20;
const MAX_FLASHCARD_COUNT = 50;

export class FlashcardGenerationService {
  static normalizeRequestedCount(count?: number) {
    if (!count || Number.isNaN(count)) {
      return DEFAULT_FLASHCARD_COUNT;
    }

    return Math.min(MAX_FLASHCARD_COUNT, Math.max(1, Math.round(count)));
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
      throw new Error('Document is not ready for flashcard generation');
    }

    return document;
  }

  static async generateForDocument(
    input: GenerateFlashcardsInput,
    callbacks: FlashcardGenerationCallbacks = {},
  ) {
    const document = await this.assertReadyOwnedDocument(input.documentId, input.userId);

    const selectedChunks = await this.loadGenerationChunks(input.documentId, input.topic);
    if (selectedChunks.length === 0) {
      throw new Error('No document chunks available for flashcard generation');
    }

    await callbacks.onPrepared?.();

    const prompt = buildFlashcardPrompt({
      title: document.title,
      summary: document.summary?.text,
      count: input.count,
      topic: input.topic,
      chunks: selectedChunks,
    });

    const response = await getChatProvider().generateJSON<GeneratedFlashcardResponse>(
      prompt,
      'flashcards',
      {
        temperature: 0,
        maxTokens: 2200,
      },
    );

    const normalizedCards = normalizeGeneratedFlashcards(response.flashcards, selectedChunks).slice(
      0,
      input.count,
    );

    if (normalizedCards.length === 0) {
      throw new Error('AI did not return any usable flashcards');
    }

    await callbacks.onGenerated?.();

    const objectUserId = new mongoose.Types.ObjectId(input.userId);
    const objectDocumentId = new mongoose.Types.ObjectId(input.documentId);
    const now = new Date();

    await Flashcard.deleteMany({
      userId: objectUserId,
      documentId: objectDocumentId,
    });

    const storedCards = await Flashcard.insertMany(
      normalizedCards.map((card) => ({
        documentId: objectDocumentId,
        userId: objectUserId,
        sourceChunkId: card.sourceChunkId,
        front: card.front,
        back: card.back,
        difficulty: card.difficulty,
        nextReviewAt: now,
        reviewCount: 0,
        successCount: 0,
      })),
    );

    await Document.findByIdAndUpdate(input.documentId, {
      flashcardCount: storedCards.length,
    });

    await callbacks.onStored?.();

    return {
      documentId: input.documentId,
      createdCount: storedCards.length,
      flashcardIds: storedCards.map((card) => card.id),
    };
  }

  private static async loadGenerationChunks(documentId: string, topic?: string) {
    const chunks = await DocumentChunk.find({ documentId })
      .sort({ chunkIndex: 1 })
      .select('_id chunkIndex text pageNumber metadata')
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

function buildFlashcardPrompt(input: {
  title: string;
  summary?: string;
  count: number;
  topic?: string;
  chunks: Array<Pick<IDocumentChunk, '_id' | 'chunkIndex' | 'text' | 'pageNumber'>>;
}) {
  const summaryBlock = input.summary ? `[Document Summary]\n${input.summary}\n\n` : '';
  const topicBlock = input.topic?.trim() ? `[Topic Focus]\n${input.topic.trim()}\n\n` : '';
  const chunkBlock = input.chunks
    .map(
      (chunk) =>
        `[Chunk ${chunk.chunkIndex} | Page ${chunk.pageNumber ?? 'unknown'}]\n${chunk.text}`,
    )
    .join('\n\n');

  return [
    'You are Lumora, an AI tutor generating study flashcards from a document.',
    'Use only the provided chunks.',
    'Return strict JSON with this shape:',
    '{"flashcards":[{"front":"string","back":"string","difficulty":"EASY|MEDIUM|HARD","sourceChunkIndex":0}]}',
    'Make the cards concise, factual, and useful for active recall.',
    'Do not include markdown fences.',
    '',
    `[Requested Count]\n${input.count}`,
    '',
    `[Document Title]\n${input.title}`,
    '',
    summaryBlock + topicBlock + '[Source Chunks]\n' + chunkBlock,
  ].join('\n');
}

function normalizeGeneratedFlashcards(
  flashcards: GeneratedFlashcardPayload[] | undefined,
  sourceChunks: Array<Pick<IDocumentChunk, '_id' | 'chunkIndex' | 'text'>>,
) {
  if (!Array.isArray(flashcards)) {
    return [];
  }

  return flashcards
    .map((card) => {
      const front = typeof card.front === 'string' ? card.front.trim() : '';
      const back = typeof card.back === 'string' ? card.back.trim() : '';
      if (!front || !back) {
        return null;
      }

      const difficulty = normalizeDifficulty(card.difficulty);
      const sourceChunk = typeof card.sourceChunkIndex === 'number'
        ? sourceChunks.find((chunk) => chunk.chunkIndex === card.sourceChunkIndex)
        : undefined;

      return {
        front,
        back,
        difficulty,
        sourceChunkId: sourceChunk?._id,
      };
    })
    .filter((card): card is NonNullable<typeof card> => card !== null);
}

function normalizeDifficulty(value?: string): FlashcardDifficulty {
  if (value === 'EASY' || value === 'MEDIUM' || value === 'HARD') {
    return value;
  }

  return 'MEDIUM';
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
