import mongoose from 'mongoose';
import { config } from '../../config/index.js';
import { getEmbeddingProvider } from '../ai/ai.config.js';
import DocumentChunk, { type IDocumentChunkMetadata } from './document-chunk.model.js';

type VectorSearchSimilarity = 'cosine' | 'dotProduct' | 'euclidean';

interface SearchIndexStatusLike {
  name?: string;
  queryable?: boolean;
  status?: string;
  latestDefinition?: unknown;
}

interface RawVectorSearchDocument {
  _id: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  chunkIndex: number;
  text: string;
  pageNumber?: number;
  tokenCount?: number;
  metadata?: IDocumentChunkMetadata;
  score: number;
}

export interface EnsureVectorIndexOptions {
  allowUnsupported?: boolean;
  waitForQueryable?: boolean;
}

export interface EnsureVectorIndexResult {
  supported: boolean;
  created: boolean;
  updated: boolean;
  queryable: boolean;
  indexName: string;
  message?: string;
}

export interface DocumentChunkSearchOptions {
  documentId?: string;
  limit?: number;
  numCandidates?: number;
}

export interface DocumentChunkSearchResult {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  pageNumber?: number;
  tokenCount?: number;
  metadata?: IDocumentChunkMetadata;
  score: number;
}

export function buildDocumentChunkVectorIndexDefinition() {
  return {
    fields: [
      {
        type: 'vector',
        path: 'embedding',
        numDimensions: config.embedding.dimensions,
        similarity: config.vectorSearch.similarity as VectorSearchSimilarity,
      },
      {
        type: 'filter',
        path: 'documentId',
      },
      {
        type: 'filter',
        path: 'pageNumber',
      },
    ],
  };
}

export function buildDocumentChunkVectorSearchPipeline(
  queryVector: number[],
  options: DocumentChunkSearchOptions = {},
) {
  validateQueryVector(queryVector);

  const limit = Math.max(options.limit ?? config.vectorSearch.defaultLimit, 1);
  const numCandidates = Math.max(
    options.numCandidates ?? limit * config.vectorSearch.numCandidatesMultiplier,
    limit,
  );

  const vectorSearchStage: Record<string, unknown> = {
    index: config.vectorSearch.indexName,
    path: 'embedding',
    queryVector,
    limit,
    numCandidates,
  };

  if (options.documentId) {
    if (!mongoose.Types.ObjectId.isValid(options.documentId)) {
      throw new Error('Invalid document ID for vector search filter');
    }

    vectorSearchStage.filter = {
      documentId: new mongoose.Types.ObjectId(options.documentId),
    };
  }

  return [
    {
      $vectorSearch: vectorSearchStage,
    },
    {
      $project: {
        _id: 1,
        documentId: 1,
        chunkIndex: 1,
        text: 1,
        pageNumber: 1,
        tokenCount: 1,
        metadata: 1,
        score: {
          $meta: 'vectorSearchScore',
        },
      },
    },
  ];
}

export async function ensureDocumentChunkVectorIndex(
  options: EnsureVectorIndexOptions = {},
): Promise<EnsureVectorIndexResult> {
  const allowUnsupported = options.allowUnsupported ?? false;
  const waitForQueryable = options.waitForQueryable ?? false;
  const definition = buildDocumentChunkVectorIndexDefinition();
  const collection = DocumentChunk.collection;

  try {
    const [existingIndex] = await collection
      .listSearchIndexes(config.vectorSearch.indexName)
      .toArray() as SearchIndexStatusLike[];

    let created = false;
    let updated = false;

    if (!existingIndex) {
      await collection.createSearchIndex({
        name: config.vectorSearch.indexName,
        type: 'vectorSearch',
        definition,
      });
      created = true;
    } else {
      const currentDefinition = extractComparableDefinition(existingIndex);
      if (!definitionsEqual(currentDefinition, definition)) {
        await collection.updateSearchIndex(config.vectorSearch.indexName, definition);
        updated = true;
      }
    }

    const status = waitForQueryable
      ? await waitForVectorIndexQueryable(config.vectorSearch.indexName)
      : await getVectorIndexStatus(config.vectorSearch.indexName);

    return {
      supported: true,
      created,
      updated,
      queryable: status.queryable,
      indexName: config.vectorSearch.indexName,
      message: status.status,
    };
  } catch (error) {
    if (isVectorSearchUnsupportedError(error)) {
      if (!allowUnsupported) {
        throw new Error(
          'MongoDB Atlas Vector Search is not available for the current database connection.',
        );
      }

      return {
        supported: false,
        created: false,
        updated: false,
        queryable: false,
        indexName: config.vectorSearch.indexName,
        message: error instanceof Error ? error.message : 'Vector search is unavailable',
      };
    }

    throw error;
  }
}

export async function searchDocumentChunksByQuery(
  query: string,
  options: DocumentChunkSearchOptions = {},
): Promise<DocumentChunkSearchResult[]> {
  const queryVector = await getEmbeddingProvider().embed(query);
  return searchDocumentChunksByVector(queryVector, options);
}

export async function searchDocumentChunksByVector(
  queryVector: number[],
  options: DocumentChunkSearchOptions = {},
): Promise<DocumentChunkSearchResult[]> {
  const pipeline = buildDocumentChunkVectorSearchPipeline(queryVector, options);
  const results = (await DocumentChunk.collection.aggregate(pipeline).toArray()) as
    RawVectorSearchDocument[];

  return results.map((chunk) => ({
    chunkId: chunk._id.toString(),
    documentId: chunk.documentId.toString(),
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    pageNumber: chunk.pageNumber,
    tokenCount: chunk.tokenCount,
    metadata: chunk.metadata,
    score: chunk.score,
  }));
}

async function waitForVectorIndexQueryable(indexName: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < config.vectorSearch.readyTimeoutMs) {
    const status = await getVectorIndexStatus(indexName);

    if (status.queryable) {
      return status;
    }

    if (status.status?.toUpperCase() === 'FAILED') {
      throw new Error(`Vector search index "${indexName}" failed to build`);
    }

    await sleep(config.vectorSearch.readyPollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for vector search index "${indexName}" to become queryable`,
  );
}

async function getVectorIndexStatus(indexName: string) {
  const [index] = await DocumentChunk.collection.listSearchIndexes(indexName).toArray() as
    SearchIndexStatusLike[];

  return {
    queryable: index?.queryable === true,
    status: index?.status ?? 'UNKNOWN',
  };
}

function extractComparableDefinition(index: SearchIndexStatusLike) {
  const definition = index.latestDefinition;
  if (!definition || typeof definition !== 'object') {
    return null;
  }

  return definition;
}

function definitionsEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateQueryVector(queryVector: number[]) {
  if (queryVector.length !== config.embedding.dimensions) {
    throw new Error(
      `Query vector dimension mismatch: expected ${config.embedding.dimensions}, received ${queryVector.length}`,
    );
  }
}

function isVectorSearchUnsupportedError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('command not found')
    || message.includes('createsearchindexes')
    || message.includes('search index')
    || message.includes('atlas search')
    || message.includes('mongot')
    || message.includes('$vectorsearch')
    || message.includes('no such command')
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
