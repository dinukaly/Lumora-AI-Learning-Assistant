import { config } from '../../config/index.js';
import type { EmbeddingProvider } from './ai-providers.js';

interface TransformersEnv {
  cacheDir?: string;
  allowLocalModels?: boolean;
  useBrowserCache?: boolean;
}

interface TensorLike {
  data: ArrayLike<number>;
  dims?: number[];
}

type FeatureExtractor = (
  input: string | string[],
  options?: Record<string, unknown>,
) => Promise<TensorLike>;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  private extractorPromise: Promise<FeatureExtractor> | null = null;

  async embed(text: string): Promise<number[]> {
    const [embedding] = await this.embedBatch([text]);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const extractor = await this.getExtractor();
    const output = await extractor(texts, {
      pooling: 'mean',
      normalize: true,
    });

    return this.toVectors(output, texts.length);
  }

  private async getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        const transformers = await import('@xenova/transformers');
        const env = transformers.env as TransformersEnv;

        if (config.embedding.local.cacheDir) {
          env.cacheDir = config.embedding.local.cacheDir;
        }

        env.allowLocalModels = false;
        env.useBrowserCache = false;

        const extractor = await transformers.pipeline('feature-extraction', config.embedding.model);
        return extractor as unknown as FeatureExtractor;
      })();
    }

    return this.extractorPromise;
  }

  private toVectors(output: TensorLike, expectedBatchSize: number): number[][] {
    const values = Array.from(output.data);
    const dims = output.dims ?? [];

    if (dims.length === 0) {
      if (expectedBatchSize !== 1) {
        throw new Error('Local embedding provider returned an unshaped tensor for a batch');
      }

      return [values];
    }

    if (dims.length === 1) {
      return [values];
    }

    const dimension = dims[dims.length - 1];
    const batchSize = dims.slice(0, -1).reduce((total, value) => total * value, 1);

    if (batchSize !== expectedBatchSize) {
      throw new Error(
        `Local embedding provider returned ${batchSize} vectors for ${expectedBatchSize} texts`,
      );
    }

    const vectors: number[][] = [];
    for (let index = 0; index < batchSize; index += 1) {
      const start = index * dimension;
      vectors.push(values.slice(start, start + dimension));
    }

    return vectors;
  }
}
