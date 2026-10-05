// Chat Provider Interface

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  finishReason: string;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface ChatChunk {
  content: string;
  done: boolean;
}

export interface ChatProvider {
  generate(prompt: string, options?: ChatOptions): Promise<ChatResponse>;
  generateStream(prompt: string, options?: ChatOptions): AsyncIterable<ChatChunk>;
  generateJSON<T>(prompt: string, schema: string, options?: ChatOptions): Promise<T>;
}

// Embedding Provider Interface

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// Citation

export interface Citation {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  snippet: string;
}

// Action Types

export type AIAction =
  | 'CHAT'
  | 'EXPLAIN_CONCEPT'
  | 'EXTRACT_CONCEPTS'
  | 'SUMMARIZE_DOCUMENT'
  | 'GENERATE_FLASHCARDS'
  | 'GENERATE_QUIZ';

// AI Orchestrator Types

export interface AIRequest {
  userId: string;
  conversationId?: string;
  documentId?: string;
  message: string;
  action?: AIAction;
}

export interface AIResponse {
  content: string;
  citations: Citation[];
  tokenUsage: ChatResponse['tokenUsage'];
  conversationId: string;
  action: AIAction;
}
