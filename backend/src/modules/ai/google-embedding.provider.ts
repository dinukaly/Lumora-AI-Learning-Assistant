import { config } from '../../config/index.js';
import type { EmbeddingProvider } from './ai-providers.js';

interface GoogleEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

interface GoogleBatchEmbeddingResponse {
  embeddings?: Array<{
    values?: number[];
  }>;
}

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey = config.embedding.google.apiKey;
  private readonly baseUrl = config.embedding.google.baseUrl;
  private readonly model = config.embedding.model;

  async embed(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    this.assertConfigured();

    if (texts.length === 1) {
      const response = await fetch(`${this.baseUrl}/${this.modelPath}:embedContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelPath,
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: config.embedding.dimensions,
          content: {
            parts: [{ text: texts[0] }],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Google embedding API error (${response.status}): ${await response.text()}`);
      }

      const data: GoogleEmbeddingResponse = await response.json();
      const embedding = data.embedding?.values;
      if (!embedding?.length) {
        throw new Error('Google embedding API returned an empty embedding');
      }

      return [embedding];
    }

    const response = await fetch(`${this.baseUrl}/${this.modelPath}:batchEmbedContents?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: this.modelPath,
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: config.embedding.dimensions,
          content: {
            parts: [{ text }],
          },
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Google embedding API error (${response.status}): ${await response.text()}`);
    }

    const data: GoogleBatchEmbeddingResponse = await response.json();
    const embeddings = data.embeddings?.map((item) => item.values ?? []) ?? [];

    if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding.length === 0)) {
      throw new Error('Google embedding API returned an unexpected batch response');
    }

    return embeddings;
  }

  private assertConfigured() {
    if (!this.apiKey) {
      throw new Error('GOOGLE_API_KEY is required when EMBEDDING_PROVIDER=google');
    }
  }

  private get modelPath() {
    return this.model.startsWith('models/') ? this.model : `models/${this.model}`;
  }
}
