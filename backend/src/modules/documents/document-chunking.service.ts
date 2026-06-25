import { config } from '../../config/index.js';
import { getEmbeddingProvider } from '../ai/ai.config.js';
import { buildSemanticChunks } from './document-chunking.js';
import { DocumentsService, type DocumentChunkWriteInput } from './documents.service.js';

export interface ChunkingHooks {
  onChunked?: (chunkCount: number) => Promise<void> | void;
  onEmbeddingBatch?: (completedBatches: number, totalBatches: number) => Promise<void> | void;
  onStored?: (chunkCount: number) => Promise<void> | void;
}

export interface ChunkingResult {
  chunkCount: number;
  embeddingDimensions: number;
}

export async function processDocumentChunking(
  documentId: string,
  hooks: ChunkingHooks = {},
): Promise<ChunkingResult> {
  const document = await DocumentsService.getDocumentForChunking(documentId);

  if (!document.extractedPages?.length) {
    throw new Error('Document does not have extracted pages for chunking');
  }

  const chunkDrafts = buildSemanticChunks(document.extractedPages);
  if (chunkDrafts.length === 0) {
    throw new Error('Semantic chunking produced no chunks');
  }

  await hooks.onChunked?.(chunkDrafts.length);

  const embeddingProvider = getEmbeddingProvider();
  const batchSize = Math.max(config.embedding.batchSize, 1);
  const totalBatches = Math.ceil(chunkDrafts.length / batchSize);
  const chunkWrites: DocumentChunkWriteInput[] = [];

  for (let offset = 0; offset < chunkDrafts.length; offset += batchSize) {
    const batch = chunkDrafts.slice(offset, offset + batchSize);
    const embeddings = await embeddingProvider.embedBatch(batch.map((chunk) => chunk.text));

    if (embeddings.length !== batch.length) {
      throw new Error('Embedding provider returned the wrong number of vectors');
    }

    embeddings.forEach((embedding) => validateEmbeddingDimensions(embedding.length));

    for (let index = 0; index < batch.length; index += 1) {
      chunkWrites.push({
        ...batch[index],
        embedding: embeddings[index],
      });
    }

    await hooks.onEmbeddingBatch?.(
      Math.floor(offset / batchSize) + 1,
      totalBatches,
    );
  }

  await DocumentsService.storeChunksAndMarkReady(documentId, chunkWrites);
  await hooks.onStored?.(chunkWrites.length);

  return {
    chunkCount: chunkWrites.length,
    embeddingDimensions: chunkWrites[0]?.embedding.length ?? 0,
  };
}

function validateEmbeddingDimensions(actual: number) {
  if (actual !== config.embedding.dimensions) {
    throw new Error(
      `Embedding dimension mismatch: expected ${config.embedding.dimensions}, received ${actual}`,
    );
  }
}
