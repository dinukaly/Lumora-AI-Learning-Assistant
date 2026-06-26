import { randomUUID } from 'crypto';
import { getChatProvider } from './ai.config.js';
import type {
  AIAction,
  AIRequest,
  AIResponse,
  Citation,
} from './ai-providers.js';
import Document from '../documents/document.model.js';
import DocumentChunk from '../documents/document-chunk.model.js';
import {
  searchDocumentChunksByQuery,
  type DocumentChunkSearchResult,
} from '../documents/document-vector-search.service.js';

export interface AIContext {
  conversationId: string;
  documentId: string;
  documentTitle: string;
  documentSummary?: string;
  retrievedChunks: DocumentChunkSearchResult[];
  userMessage: string;
}

export interface AIOrchestrator {
  process(request: AIRequest): Promise<AIResponse>;
  searchChunks(
    query: string,
    documentId: string,
    topK: number,
  ): Promise<DocumentChunkSearchResult[]>;
  buildPrompt(action: AIAction, context: AIContext): string;
  detectIntent(query: string): Promise<AIAction>;
  assembleContext(input: {
    conversationId?: string;
    documentId: string;
    userMessage: string;
    chunks: DocumentChunkSearchResult[];
  }): Promise<AIContext>;
}

const INTENT_PATTERNS: Array<{ action: AIAction; pattern: RegExp }> = [
  {
    action: 'GENERATE_FLASHCARDS',
    pattern: /\b(flashcards?|study cards?)\b/i,
  },
  {
    action: 'GENERATE_QUIZ',
    pattern: /\b(quiz|quizzes|test me|practice questions?)\b/i,
  },
  {
    action: 'SUMMARIZE_DOCUMENT',
    pattern: /\b(summarize|summary|overview|key takeaways?)\b/i,
  },
  {
    action: 'EXPLAIN_CONCEPT',
    pattern: /\b(explain|what is|how does|why does|walk me through|teach me)\b/i,
  },
];

const SYSTEM_PROMPTS: Record<AIAction, string> = {
  CHAT: 'You are Lumora, an AI tutor. Answer the user using only the provided document context.',
  EXPLAIN_CONCEPT:
    'You are Lumora, an AI tutor. Explain the concept clearly using only the provided document context.',
  SUMMARIZE_DOCUMENT:
    'You are Lumora, an AI tutor. Summarize the document using only the provided context.',
  GENERATE_FLASHCARDS:
    'You are Lumora, an AI tutor. Suggest study-card-ready takeaways from the provided document context.',
  GENERATE_QUIZ:
    'You are Lumora, an AI tutor. Suggest quiz-ready understanding checks from the provided document context.',
};

export class AIService implements AIOrchestrator {
  async process(request: AIRequest): Promise<AIResponse> {
    if (!request.documentId) {
      throw new Error('AI orchestrator currently requires a documentId');
    }

    const action = request.action ?? await this.detectIntent(request.message);
    const retrievedChunks = await this.searchChunks(request.message, request.documentId, 5);
    const context = await this.assembleContext({
      conversationId: request.conversationId,
      documentId: request.documentId,
      userMessage: request.message,
      chunks: retrievedChunks,
    });
    const prompt = this.buildPrompt(action, context);
    const response = await getChatProvider().generate(prompt, {
      temperature: action === 'CHAT' ? 0.3 : 0.2,
      maxTokens: 900,
    });

    return {
      content: response.content,
      citations: buildCitations(retrievedChunks),
      tokenUsage: response.tokenUsage,
      conversationId: context.conversationId,
      action,
    };
  }

  async searchChunks(
    query: string,
    documentId: string,
    topK: number,
  ): Promise<DocumentChunkSearchResult[]> {
    const vectorResults = await searchDocumentChunksByQuery(query, {
      documentId,
      limit: topK,
    });

    if (vectorResults.length > 0) {
      return vectorResults;
    }

    return searchDocumentChunksByKeyword(query, documentId, topK);
  }

  buildPrompt(action: AIAction, context: AIContext): string {
    const systemPrompt = SYSTEM_PROMPTS[action];
    const summaryBlock = context.documentSummary
      ? `\n[Document Summary]\n${context.documentSummary}\n`
      : '';
    const chunkBlock = context.retrievedChunks.length > 0
      ? context.retrievedChunks
          .map(
            (chunk, index) =>
              `[Chunk ${index + 1} | page ${chunk.pageNumber ?? 'unknown'} | score ${chunk.score.toFixed(3)}]\n${chunk.text}`,
          )
          .join('\n\n')
      : '[No relevant chunks were retrieved for this question.]';

    return [
      systemPrompt,
      'Rules:',
      '- Use only the provided document context.',
      '- If the answer is not supported by the context, say the document does not cover it.',
      '- Cite the page number when you rely on a chunk.',
      '',
      `[Conversation Id]\n${context.conversationId}`,
      '',
      `[Document Title]\n${context.documentTitle}`,
      summaryBlock,
      '[Retrieved Chunks]',
      chunkBlock,
      '',
      '[User Request]',
      context.userMessage,
    ].join('\n');
  }

  async detectIntent(query: string): Promise<AIAction> {
    for (const matcher of INTENT_PATTERNS) {
      if (matcher.pattern.test(query)) {
        return matcher.action;
      }
    }

    return 'CHAT';
  }

  async assembleContext(input: {
    conversationId?: string;
    documentId: string;
    userMessage: string;
    chunks: DocumentChunkSearchResult[];
  }): Promise<AIContext> {
    const document = await Document.findById(input.documentId)
      .select('title summary')
      .lean();

    if (!document) {
      throw new Error('Document not found for AI orchestration');
    }

    return {
      conversationId: input.conversationId ?? buildEphemeralConversationId(input.documentId),
      documentId: input.documentId,
      documentTitle: document.title,
      documentSummary: document.summary?.text,
      retrievedChunks: input.chunks,
      userMessage: input.userMessage,
    };
  }
}

export function getAIOrchestrator() {
  return new AIService();
}

function buildCitations(chunks: DocumentChunkSearchResult[]): Citation[] {
  return chunks.slice(0, 3).map((chunk) => ({
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    pageNumber: chunk.pageNumber ?? 0,
    snippet: chunk.text.slice(0, 220),
  }));
}

function buildEphemeralConversationId(documentId: string) {
  return `ephemeral:${documentId}:${randomUUID()}`;
}

async function searchDocumentChunksByKeyword(
  query: string,
  documentId: string,
  topK: number,
): Promise<DocumentChunkSearchResult[]> {
  const keywords = tokenizeQuery(query);
  const chunks = await DocumentChunk.find({ documentId })
    .select('documentId chunkIndex text pageNumber tokenCount metadata')
    .lean();

  const scored = chunks
    .map((chunk) => {
      const haystack = chunk.text.toLowerCase();
      const score = keywords.reduce((total, keyword) => {
        if (!haystack.includes(keyword)) {
          return total;
        }

        return total + countOccurrences(haystack, keyword);
      }, 0);

      return {
        chunkId: chunk._id.toString(),
        documentId: chunk.documentId.toString(),
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        pageNumber: chunk.pageNumber,
        tokenCount: chunk.tokenCount,
        metadata: chunk.metadata,
        score,
      } satisfies DocumentChunkSearchResult;
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
    .slice(0, topK);

  if (scored.length > 0) {
    return scored;
  }

  return chunks
    .sort((left, right) => left.chunkIndex - right.chunkIndex)
    .slice(0, topK)
    .map((chunk) => ({
      chunkId: chunk._id.toString(),
      documentId: chunk.documentId.toString(),
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      pageNumber: chunk.pageNumber,
      tokenCount: chunk.tokenCount,
      metadata: chunk.metadata,
      score: 0,
    }));
}

function tokenizeQuery(query: string) {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((token) => token.length >= 3),
    ),
  );
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}
