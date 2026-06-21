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

let embeddingProviderInstance: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProviderInstance) return embeddingProviderInstance;

  switch (config.embedding.provider) {
    case 'google':
      // Google text-embedding-004 via OpenRouter's embedding endpoint
      embeddingProviderInstance = new OpenRouterEmbeddingProvider();
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

// OpenRouter Embedding Provider

class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = config.chat.openrouter.apiKey;
    this.baseUrl = config.chat.openrouter.baseUrl;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Lumora',
      },
      body: JSON.stringify({
        model: config.embedding.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
    };

    // Sort by index to maintain input order
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}