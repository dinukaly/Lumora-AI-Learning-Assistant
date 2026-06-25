import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSemanticChunks } from './document-chunking.js';

test('semantic chunking preserves overlap and page metadata', () => {
  const chunks = buildSemanticChunks(
    [
      {
        page: 1,
        text:
          'The mitochondria is the powerhouse of the cell and supports cellular respiration. ' +
          'ATP production happens through a series of membrane-bound reactions.\n\n' +
          'Cells also regulate transport, signaling, and metabolism through coordinated pathways.',
      },
      {
        page: 2,
        text:
          'Enzymes lower activation energy so reactions happen more efficiently. ' +
          'This makes biochemical pathways stable enough for life.',
      },
    ],
    {
      targetTokens: 18,
      maxTokens: 22,
      overlapTokens: 4,
    },
  );

  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0].metadata.pageNumbers, [1]);
  assert.ok(chunks[1].metadata.pageNumbers.includes(1));
  assert.ok(chunks[2].metadata.pageNumbers.includes(2));

  const overlap = chunks[0].text.split(/\s+/).slice(-4).join(' ');
  assert.ok(chunks[1].text.startsWith(overlap), 'second chunk should start with overlap');
});

test('semantic chunking falls back to token slicing for oversized sentences', () => {
  const longSentence = new Array(21).fill('photosynthesis').join(' ');
  const chunks = buildSemanticChunks(
    [{ page: 7, text: longSentence }],
    {
      targetTokens: 8,
      maxTokens: 8,
      overlapTokens: 2,
    },
  );

  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((chunk) => chunk.tokenCount <= 10));
  assert.ok(chunks.every((chunk) => chunk.pageNumber === 7));
  assert.ok(chunks[1].text.startsWith('photosynthesis photosynthesis'));
});
