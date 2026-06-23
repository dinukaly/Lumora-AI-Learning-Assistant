import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { config } from '../../config/index.js';
import {
  buildDocumentChunkVectorIndexDefinition,
  buildDocumentChunkVectorSearchPipeline,
} from './document-vector-search.service.js';

test('vector index definition follows configured embedding dimensions and filter fields', () => {
  const definition = buildDocumentChunkVectorIndexDefinition();

  assert.equal(definition.fields[0]?.type, 'vector');
  assert.equal(definition.fields[0]?.path, 'embedding');
  assert.equal(definition.fields[0]?.numDimensions, config.embedding.dimensions);
  assert.equal(definition.fields[0]?.similarity, config.vectorSearch.similarity);
  assert.deepEqual(
    definition.fields.slice(1).map((field) => field.path),
    ['documentId', 'pageNumber'],
  );
});

test('vector search pipeline starts with $vectorSearch and projects scores', () => {
  const documentId = new mongoose.Types.ObjectId().toString();
  const queryVector = new Array(config.embedding.dimensions).fill(0.25);
  const pipeline = buildDocumentChunkVectorSearchPipeline(queryVector, {
    documentId,
    limit: 3,
  });

  const firstStage = pipeline[0] as {
    $vectorSearch: {
      index: string;
      path: string;
      queryVector: number[];
      limit: number;
      numCandidates: number;
      filter?: { documentId: mongoose.Types.ObjectId };
    };
  };

  assert.ok('$vectorSearch' in firstStage);
  assert.equal(firstStage.$vectorSearch.index, config.vectorSearch.indexName);
  assert.equal(firstStage.$vectorSearch.path, 'embedding');
  assert.equal(firstStage.$vectorSearch.limit, 3);
  assert.ok(firstStage.$vectorSearch.numCandidates >= 3);
  assert.equal(
    firstStage.$vectorSearch.filter?.documentId.toString(),
    documentId,
  );

  const secondStage = pipeline[1] as { $project: { score: { $meta: string } } };
  assert.equal(secondStage.$project.score.$meta, 'vectorSearchScore');
});
