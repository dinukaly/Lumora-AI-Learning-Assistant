import assert from 'node:assert/strict';
import test from 'node:test';
import { AIService } from './ai.service.js';

test('detectIntent classifies common workspace actions', async () => {
  const orchestrator = new AIService();

  assert.equal(await orchestrator.detectIntent('Summarize this document for me'), 'SUMMARIZE_DOCUMENT');
  assert.equal(await orchestrator.detectIntent('Generate flashcards from this chapter'), 'GENERATE_FLASHCARDS');
  assert.equal(await orchestrator.detectIntent('Make me a quiz about this topic'), 'GENERATE_QUIZ');
  assert.equal(await orchestrator.detectIntent('Explain how ribosomes work'), 'EXPLAIN_CONCEPT');
  assert.equal(await orchestrator.detectIntent('Tell me what the document says about proteins'), 'CHAT');
});

test('buildPrompt includes context, chunks, and user request', () => {
  const orchestrator = new AIService();
  const prompt = orchestrator.buildPrompt('CHAT', {
    conversationId: 'ephemeral:doc123:test',
    documentId: 'doc123',
    documentTitle: 'Biology Notes',
    documentSummary: 'A short biology overview.',
    recentMessages: [
      {
        role: 'user',
        content: 'Remind me what proteins do.',
      },
    ],
    userMessage: 'What does the document say about ribosomes?',
    retrievedChunks: [
      {
        chunkId: 'chunk1',
        documentId: 'doc123',
        chunkIndex: 0,
        text: 'Ribosomes build proteins for the cell.',
        pageNumber: 4,
        tokenCount: 8,
        metadata: {
          pageNumbers: [4],
          startPageNumber: 4,
          endPageNumber: 4,
        },
        score: 0.92,
      },
    ],
  });

  assert.match(prompt, /Biology Notes/);
  assert.match(prompt, /A short biology overview/);
  assert.match(prompt, /Remind me what proteins do/);
  assert.match(prompt, /Ribosomes build proteins for the cell/);
  assert.match(prompt, /What does the document say about ribosomes/);
  assert.match(prompt, /page 4/);
});
