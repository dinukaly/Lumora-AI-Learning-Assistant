import assert from 'node:assert/strict';
import mongoose from 'mongoose';

async function main() {
  process.env.CHAT_PROVIDER ??= 'mock';

  const { connectDB } = await import('../src/config/db.js');
  const { default: app } = await import('../src/app.js');
  const { generateAccessToken } = await import('../src/common/utils/jwt.js');
  const {
    closeDocumentQueue,
  } = await import('../src/common/queue/index.js');
  const { startDocumentWorker, stopDocumentWorker } = await import('../src/common/queue/worker.js');
  const { default: User } = await import('../src/modules/users/user.model.js');
  const { default: Document } = await import('../src/modules/documents/document.model.js');
  const { default: DocumentChunk } = await import('../src/modules/documents/document-chunk.model.js');
  const { default: JobModel } = await import('../src/modules/jobs/job.model.js');
  const { default: Flashcard } = await import('../src/modules/learning/flashcard.model.js');

  await connectDB();

  const user = await User.create({
    name: 'Flashcard Verifier',
    email: `verify-t51-${Date.now()}@example.com`,
    passwordHash: 'password123',
    role: 'USER',
    emailVerifiedAt: new Date(),
  });

  const document = await Document.create({
    ownerId: user._id,
    title: 'React Hooks Notes',
    originalFileName: 'react-hooks.pdf',
    storageUrl: 'https://example.com/react-hooks.pdf',
    status: 'READY',
    fileSize: 1024,
    summary: {
      text: 'The notes cover React hooks like useState and useEffect.',
      generatedFromChunks: true,
      generatedAt: new Date(),
    },
  });

  await DocumentChunk.insertMany([
    {
      documentId: document._id,
      chunkIndex: 0,
      text: 'useState is a React hook that adds state to functional components.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 4,
      tokenCount: 12,
      metadata: { pageNumbers: [4], startPageNumber: 4, endPageNumber: 4 },
    },
    {
      documentId: document._id,
      chunkIndex: 1,
      text: 'useEffect runs side effects after render and can react to dependency changes.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 6,
      tokenCount: 14,
      metadata: { pageNumbers: [6], startPageNumber: 6, endPageNumber: 6 },
    },
  ]);

  const accessToken = generateAccessToken({ userId: user.id, role: 'USER' });
  startDocumentWorker();
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine verification server port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const enqueueResponse = await fetch(`${baseUrl}/ai/generate-flashcards`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        documentId: document.id,
        count: 4,
        topic: 'React hooks',
      }),
    });

    assert.equal(enqueueResponse.status, 202);
    const enqueueJson = await enqueueResponse.json();
    assert.equal(typeof enqueueJson.jobId, 'string');

    const completedJob = await waitForCompletedJob(enqueueJson.jobId);
    assert.equal(completedJob.status, 'COMPLETED');

    const flashcardListResponse = await fetch(
      `${baseUrl}/learning/flashcards?documentId=${document.id}&page=1&limit=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    assert.equal(flashcardListResponse.status, 200);
    const flashcardListJson = await flashcardListResponse.json();
    assert.equal(flashcardListJson.flashcards.length > 0, true);

    const firstFlashcard = flashcardListJson.flashcards[0];
    const previousReviewCount = firstFlashcard.reviewCount;

    const reviewResponse = await fetch(`${baseUrl}/learning/flashcards/${firstFlashcard.id}/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ difficulty: 'EASY' }),
    });
    assert.equal(reviewResponse.status, 200);
    const reviewJson = await reviewResponse.json();
    assert.equal(reviewJson.reviewCount, previousReviewCount + 1);
    assert.equal(reviewJson.successCount >= 1, true);

    const dueOnlyResponse = await fetch(
      `${baseUrl}/learning/flashcards?documentId=${document.id}&dueOnly=true&page=1&limit=10`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    assert.equal(dueOnlyResponse.status, 200);

    console.log(JSON.stringify({
      jobId: enqueueJson.jobId,
      generatedFlashcards: flashcardListJson.flashcards.length,
      reviewedFlashcardId: firstFlashcard.id,
      nextReviewAt: reviewJson.nextReviewAt,
      reviewCount: reviewJson.reviewCount,
      successCount: reviewJson.successCount,
    }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await Promise.all([
      Flashcard.deleteMany({ documentId: document._id }),
      JobModel.deleteMany({ documentId: document._id }),
      DocumentChunk.deleteMany({ documentId: document._id }),
      Document.deleteMany({ _id: document._id }),
      User.deleteMany({ _id: user._id }),
    ]);

    await stopDocumentWorker();
    await closeDocumentQueue();
    await mongoose.disconnect();
  }
}

async function waitForCompletedJob(jobId: string) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30000) {
    const job = await (await import('../src/modules/jobs/job.model.js')).default.findById(jobId).lean();
    if (job?.status === 'COMPLETED') {
      return job;
    }

    if (job?.status === 'FAILED') {
      throw new Error(job.error ?? 'Flashcard job failed');
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for flashcard generation job');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
