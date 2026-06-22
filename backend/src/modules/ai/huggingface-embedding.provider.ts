import { config } from '../../config/index.js';
import type { EmbeddingProvider } from './ai-providers.js';

type NumericArray = number[];
type NumericMatrix = number[][];
type HuggingFaceEmbeddingPayload = NumericArray | NumericMatrix | NumericMatrix[];

export class HuggingFaceEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey = config.embedding.huggingface.apiKey;
  private readonly baseUrl = config.embedding.huggingface.baseUrl;
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

    const response = await fetch(`${this.baseUrl}/${this.model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        inputs: texts.length === 1 ? texts[0] : texts,
        options: {
          wait_for_model: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace embedding API error (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as HuggingFaceEmbeddingPayload;
    return this.normalizeBatchResponse(data, texts.length);
  }

  private normalizeBatchResponse(
    payload: HuggingFaceEmbeddingPayload,
    expectedCount: number,
  ): number[][] {
    if (!Array.isArray(payload)) {
      throw new Error('HuggingFace embedding API returned a non-array response');
    }

    if (payload.length === 0) {
      throw new Error('HuggingFace embedding API returned an empty response');
    }

    if (typeof payload[0] === 'number') {
      return [payload as NumericArray];
    }

    const firstItem = payload[0];
    if (!Array.isArray(firstItem)) {
      throw new Error('HuggingFace embedding API returned an unexpected payload');
    }

    if (typeof firstItem[0] === 'number') {
      const matrix = payload as NumericMatrix;
      if (expectedCount > 1 && matrix.length === expectedCount) {
        return matrix;
      }

      if (expectedCount === 1) {
        return [this.meanPool(matrix)];
      }
    }

    const nested = payload as NumericMatrix[];
    if (nested.length !== expectedCount) {
      throw new Error('HuggingFace embedding API returned the wrong number of embeddings');
    }

    return nested.map((matrix) => this.meanPool(matrix));
  }

  private meanPool(matrix: NumericMatrix): number[] {
    if (matrix.length === 0) {
      throw new Error('Cannot pool an empty embedding matrix');
    }

    const dimension = matrix[0]?.length ?? 0;
    if (dimension === 0) {
      throw new Error('Cannot pool an empty embedding vector');
    }

    const totals = new Array<number>(dimension).fill(0);
    for (const row of matrix) {
      if (row.length !== dimension) {
        throw new Error('HuggingFace embedding matrix has inconsistent dimensions');
      }

      for (let i = 0; i < dimension; i += 1) {
        totals[i] += row[i];
      }
    }

    return totals.map((value) => value / matrix.length);
  }

  private assertConfigured() {
    if (!this.apiKey) {
      throw new Error('HUGGINGFACE_API_KEY is required when EMBEDDING_PROVIDER=huggingface');
    }
  }
}
