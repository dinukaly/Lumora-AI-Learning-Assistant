import { config } from '../../config/index.js';
import type { ChatProvider, EmbeddingProvider } from './ai-providers.js';
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
// Real embedding providers (Google, HuggingFace, local) will be added in a future phase.
// For now, the mock provider is the only available option.

let embeddingProviderInstance: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProviderInstance) return embeddingProviderInstance;

  if (config.embedding.provider !== 'mock') {
    console.warn(
      `Embedding provider "${config.embedding.provider}" is not yet implemented. ` +
      'Falling back to MockEmbeddingProvider. ' +
      'Set EMBEDDING_PROVIDER=mock in your .env for now.',
    );
  }

  embeddingProviderInstance = new MockEmbeddingProvider();
  return embeddingProviderInstance;
}

// Mock Providers (for testing / offline dev)

class MockChatProvider implements ChatProvider {
  async generate(prompt: string): Promise<any> {
    return {
      content: `[Mock response to: "${prompt.slice(0, 50)}..."]`,
      finishReason: 'stop',
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
    };
  }

  async generateJSON<T>(prompt: string): Promise<T> {
    return JSON.parse(`{"mock": true, "query": "${prompt.slice(0, 20)}"}`) as T;
  }

  async *generateStream(prompt: string): AsyncIterable<any> {
    const words = `[Mock streaming response to: "${prompt.slice(0, 30)}..."]`.split(' ');
    for (const word of words) {
      yield { content: word + ' ', done: false };
    }
    yield { content: '', done: true };
  }
}

class MockEmbeddingProvider implements EmbeddingProvider {
  async embed(_text: string): Promise<number[]> {
    return new Array(config.embedding.dimensions).fill(0.1);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(config.embedding.dimensions).fill(0.1));
  }
}