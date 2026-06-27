import { config } from '../../config/index.js';
import type {
  ChatChunk,
  ChatProvider,
  ChatResponse,
  EmbeddingProvider,
} from './ai-providers.js';
import { GoogleEmbeddingProvider } from './google-embedding.provider.js';
import { HuggingFaceEmbeddingProvider } from './huggingface-embedding.provider.js';
import { LocalEmbeddingProvider } from './local-embedding.provider.js';
import { OpenRouterChatProvider } from './openrouter.provider.js';

// Chat Provider Factory

let chatProviderInstance: ChatProvider | null = null;

export function getChatProvider(): ChatProvider {
  if (chatProviderInstance) return chatProviderInstance;

  switch (config.chat.provider) {
    case 'openrouter':
      chatProviderInstance = new OpenRouterChatProvider();
      break;
    case 'mock':
      chatProviderInstance = new MockChatProvider();
      break;
    default:
      throw new Error(`Unknown chat provider: ${config.chat.provider}`);
  }

  return chatProviderInstance;
}

// Embedding Provider Factory

let embeddingProviderInstance: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProviderInstance) return embeddingProviderInstance;

  switch (config.embedding.provider) {
    case 'google':
      embeddingProviderInstance = new GoogleEmbeddingProvider();
      break;
    case 'huggingface':
      embeddingProviderInstance = new HuggingFaceEmbeddingProvider();
      break;
    case 'local':
      embeddingProviderInstance = new LocalEmbeddingProvider();
      break;
    case 'mock':
      embeddingProviderInstance = new MockEmbeddingProvider();
      break;
    default:
      throw new Error(`Unknown embedding provider: ${config.embedding.provider}`);
  }
  return embeddingProviderInstance;
}

// Mock Providers (for testing / offline dev)

class MockChatProvider implements ChatProvider {
  async generate(prompt: string): Promise<ChatResponse> {
    return {
      content: `[Mock response to: "${prompt.slice(0, 50)}..."]`,
      finishReason: 'stop',
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
    };
  }

  async generateJSON<T>(prompt: string, _schema: string): Promise<T> {
    void _schema;
    const requestedCountMatch = prompt.match(/\[Requested Count\]\s*(\d+)/i);
    const requestedCount = requestedCountMatch ? Math.max(1, Number.parseInt(requestedCountMatch[1], 10)) : 3;

    if (/flashcard/i.test(prompt)) {
      return {
        flashcards: Array.from({ length: Math.min(requestedCount, 5) }, (_, index) => ({
          front: `Flashcard ${index + 1}: What is the key concept?`,
          back: `Mock answer ${index + 1} based on the provided document chunks.`,
          difficulty: index % 3 === 0 ? 'EASY' : index % 3 === 1 ? 'MEDIUM' : 'HARD',
          sourceChunkIndex: index,
        })),
      } as T;
    }

    return JSON.parse(`{"mock": true, "query": "${prompt.slice(0, 20)}"}`) as T;
  }

  async *generateStream(prompt: string): AsyncIterable<ChatChunk> {
    const words = `[Mock streaming response to: "${prompt.slice(0, 30)}..."]`.split(' ');
    for (const word of words) {
      yield { content: word + ' ', done: false };
    }
    yield { content: '', done: true };
  }
}

class MockEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    void text;
    return new Array(config.embedding.dimensions).fill(0.1);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(config.embedding.dimensions).fill(0.1));
  }
}
