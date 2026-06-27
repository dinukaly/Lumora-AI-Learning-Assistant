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
import Message from '../conversations/message.model.js';
import {
  searchDocumentChunksByQuery,
  type DocumentChunkSearchResult,
} from '../documents/document-vector-search.service.js';

export interface AIContext {
  conversationId: string;
  documentId: string;
  documentTitle: string;
  documentSummary?: string;
  conversationSummary?: string;
  queryScope: 'DOCUMENT' | 'ASSISTANT_META' | 'GENERAL';
  recentMessages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  retrievedChunks: DocumentChunkSearchResult[];
  userMessage: string;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
  response?: AIResponse;
}

export interface AIOrchestrator {
  process(request: AIRequest): Promise<AIResponse>;
  processStream(request: AIRequest): AsyncIterable<AIStreamChunk>;
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
  CHAT: 'You are Lumora, an AI tutor helping the user learn from their document.',
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
    const preparedRequest = await this.prepareRequest(request);
    const response = await getChatProvider().generate(preparedRequest.prompt, {
      temperature: preparedRequest.action === 'CHAT' ? 0.3 : 0.2,
      maxTokens: 900,
    });

    return {
      content: response.content,
      citations: preparedRequest.citations,
      tokenUsage: response.tokenUsage,
      conversationId: preparedRequest.context.conversationId,
      action: preparedRequest.action,
    };
  }

  async *processStream(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const preparedRequest = await this.prepareRequest(request);
    let content = '';

    for await (const chunk of getChatProvider().generateStream(preparedRequest.prompt, {
      temperature: preparedRequest.action === 'CHAT' ? 0.3 : 0.2,
      maxTokens: 900,
      stream: true,
    })) {
      if (chunk.content) {
        content += chunk.content;
      }

      yield {
        content: chunk.content,
        done: chunk.done,
        response: chunk.done
          ? {
            content,
            citations: preparedRequest.citations,
            tokenUsage: { prompt: 0, completion: 0, total: 0 },
            conversationId: preparedRequest.context.conversationId,
            action: preparedRequest.action,
          }
          : undefined,
      };
    }
  }

  private async prepareRequest(request: AIRequest) {
    if (!request.documentId) {
      throw new Error('AI orchestrator currently requires a documentId');
    }

    const action = request.action ?? await this.detectIntent(request.message);
    const initialQueryScope = classifyQueryScope(request.message, action);
    let retrievedChunks = initialQueryScope === 'ASSISTANT_META'
      ? []
      : await this.searchChunks(request.message, request.documentId, 5, {
        fallbackToDocumentStart: action === 'SUMMARIZE_DOCUMENT',
      });

    if (
      action === 'CHAT'
      && initialQueryScope !== 'DOCUMENT'
      && !retrievedChunks.some((chunk) => chunkHasKeywordOverlap(request.message, chunk.text))
    ) {
      retrievedChunks = [];
    }

    const queryScope = action !== 'CHAT'
      ? 'DOCUMENT'
      : initialQueryScope === 'ASSISTANT_META'
        ? 'ASSISTANT_META'
        : retrievedChunks.length > 0
          ? 'DOCUMENT'
          : 'GENERAL';

    const context = await this.assembleContext({
      conversationId: request.conversationId,
      documentId: request.documentId,
      queryScope,
      userMessage: request.message,
      chunks: retrievedChunks,
    });
    const prompt = this.buildPrompt(action, context);

    return {
      action,
      context,
      prompt,
      citations: buildCitations(retrievedChunks),
    };
  }

  async searchChunks(
    query: string,
    documentId: string,
    topK: number,
    options: { fallbackToDocumentStart?: boolean } = {},
  ): Promise<DocumentChunkSearchResult[]> {
    try {
      const vectorResults = await searchDocumentChunksByQuery(query, {
        documentId,
        limit: topK,
      });

      if (vectorResults.length > 0) {
        return vectorResults;
      }
    } catch {
      // Fall through to lexical retrieval when vector search is unavailable.
    }

    return searchDocumentChunksByKeyword(query, documentId, topK, options);
  }

  buildPrompt(action: AIAction, context: AIContext): string {
    const systemPrompt = SYSTEM_PROMPTS[action];
    const summaryBlock = context.documentSummary
      ? `\n[Document Summary]\n${context.documentSummary}\n`
      : '';
    const conversationSummaryBlock = context.conversationSummary
      ? `\n[Conversation Summary]\n${context.conversationSummary}\n`
      : '';
    const recentMessagesBlock = context.recentMessages.length > 0
      ? context.recentMessages
          .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
          .join('\n')
      : '[No recent conversation history.]';
    const chunkBlock = context.retrievedChunks.length > 0
      ? context.retrievedChunks
          .map(
            (chunk, index) =>
              `[Chunk ${index + 1} | page ${chunk.pageNumber ?? 'unknown'} | score ${chunk.score.toFixed(3)}]\n${chunk.text}`,
          )
          .join('\n\n')
      : '[No relevant chunks were retrieved for this question.]';
    const rules = buildPromptRules(action, context);

    return [
      systemPrompt,
      'Rules:',
      ...rules,
      '',
      `[Conversation Id]\n${context.conversationId}`,
      '',
      `[Document Title]\n${context.documentTitle}`,
      '',
      `[Query Scope]\n${context.queryScope}`,
      summaryBlock,
      conversationSummaryBlock,
      '[Recent Messages]',
      recentMessagesBlock,
      '',
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
    queryScope: 'DOCUMENT' | 'ASSISTANT_META' | 'GENERAL';
    userMessage: string;
    chunks: DocumentChunkSearchResult[];
  }): Promise<AIContext> {
    const document = await Document.findById(input.documentId)
      .select('title summary')
      .lean();

    if (!document) {
      throw new Error('Document not found for AI orchestration');
    }

    const recentMessages = input.conversationId && !input.conversationId.startsWith('ephemeral:')
      ? await Message.find({ conversationId: input.conversationId })
        .sort({ createdAt: -1 })
        .limit(6)
        .select('role content')
        .lean()
      : [];

    return {
      conversationId: input.conversationId ?? buildEphemeralConversationId(input.documentId),
      documentId: input.documentId,
      documentTitle: document.title,
      documentSummary: document.summary?.text,
      conversationSummary: undefined,
      queryScope: input.queryScope,
      recentMessages: recentMessages.reverse().map((message) => ({
        role: message.role,
        content: message.content,
      })),
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
  options: { fallbackToDocumentStart?: boolean } = {},
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

  if (!options.fallbackToDocumentStart) {
    return [];
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

function classifyQueryScope(
  query: string,
  action: AIAction,
): 'DOCUMENT' | 'ASSISTANT_META' | 'GENERAL' {
  if (action !== 'CHAT') {
    return 'DOCUMENT';
  }

  if (ASSISTANT_META_PATTERN.test(query)) {
    return 'ASSISTANT_META';
  }

  if (DOCUMENT_REFERENCE_PATTERN.test(query)) {
    return 'DOCUMENT';
  }

  return 'GENERAL';
}

function chunkHasKeywordOverlap(query: string, chunkText: string) {
  const keywords = tokenizeQuery(query);
  if (keywords.length === 0) {
    return false;
  }

  const haystack = chunkText.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function buildPromptRules(action: AIAction, context: AIContext) {
  if (action !== 'CHAT') {
    return [
      '- Use only the provided document context.',
      '- If the answer is not supported by the context, say the document does not cover it.',
      '- Cite the page number when you rely on a chunk.',
    ];
  }

  if (context.queryScope === 'ASSISTANT_META') {
    return [
      '- The user is greeting you or asking about your role/capabilities.',
      '- Reply naturally and briefly in 1-2 sentences.',
      '- Do not pretend the answer comes from the document.',
      '- Do not cite document pages unless you actually rely on document context.',
    ];
  }

  if (context.queryScope === 'GENERAL') {
    return [
      '- No relevant document support was found for this request.',
      '- Briefly say you could not find that answer in this document.',
      '- Invite the user to ask about the document, its concepts, or cited pages.',
      '- Do not cite document pages when no relevant chunks were retrieved.',
    ];
  }

  return [
    '- Use only the provided document context.',
    '- If the answer is not supported by the context, say the document does not cover it.',
    '- Cite the page number when you rely on a chunk.',
  ];
}

const ASSISTANT_META_PATTERN =
  /\b(hello|hi|hey|yo|good morning|good afternoon|good evening|thanks|thank you|who are you|what are you|are you (?:a )?real ai|are you real|are you an? ai|what can you do|how can you help|your role|your name)\b/i;

const DOCUMENT_REFERENCE_PATTERN =
  /\b(document|pdf|notes?|chapter|section|page|pages|text|passage|according to|from this|in this)\b/i;
