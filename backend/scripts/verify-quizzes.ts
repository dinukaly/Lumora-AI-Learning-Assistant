import assert from 'node:assert/strict';
import mongoose from 'mongoose';

async function main() {
  process.env.CHAT_PROVIDER ??= 'mock';

  const { connectDB } = await import('../src/config/db.js');
  const { default: app } = await import('../src/app.js');
  const { generateAccessToken } = await import('../src/common/utils/jwt.js');
  const { closeDocumentQueue } = await import('../src/common/queue/index.js');
  const { documentWorker } = await import('../src/common/queue/worker.js');
  const { default: User } = await import('../src/modules/users/user.model.js');
  const { default: Document } = await import('../src/modules/documents/document.model.js');
  const { default: DocumentChunk } = await import('../src/modules/documents/document-chunk.model.js');
  const { default: JobModel } = await import('../src/modules/jobs/job.model.js');
  const { default: Quiz } = await import('../src/modules/learning/quiz.model.js');
  const { default: QuizAttempt } = await import('../src/modules/learning/quiz-attempt.model.js');

  await connectDB();

  const user = await User.create({
    name: 'Quiz Verifier',
    email: `verify-t53-${Date.now()}@example.com`,
    passwordHash: 'password123',
    role: 'USER',
  });

  const document = await Document.create({
    ownerId: user._id,
    title: 'React Hooks Notes',
    originalFileName: 'react-hooks.pdf',
    storageUrl: 'https://example.com/react-hooks.pdf',
    status: 'READY',
    fileSize: 4096,
    summary: {
      text: 'The notes explain useState, useEffect, and dependency arrays.',
      generatedFromChunks: true,
      generatedAt: new Date(),
    },
  });

  await DocumentChunk.insertMany([
    {
      documentId: document._id,
      chunkIndex: 0,
      text: 'useState adds local state to a functional React component.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 4,
      tokenCount: 12,
      metadata: { pageNumbers: [4], startPageNumber: 4, endPageNumber: 4 },
    },
    {
      documentId: document._id,
      chunkIndex: 1,
      text: 'useEffect runs after render and responds to dependency array changes.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 6,
      tokenCount: 14,
      metadata: { pageNumbers: [6], startPageNumber: 6, endPageNumber: 6 },
    },
  ]);

  const accessToken = generateAccessToken({ userId: user.id, role: 'USER' });
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

    const enqueueResponse = await fetch(`${baseUrl}/ai/generate-quiz`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        documentId: document.id,
        questionCount: 4,
        difficulty: 'MEDIUM',
        topic: 'React hooks',
      }),
    });
    assert.equal(enqueueResponse.status, 202);
    const enqueueJson = await enqueueResponse.json();
    assert.equal(typeof enqueueJson.jobId, 'string');

    const completedJob = await waitForCompletedJob(enqueueJson.jobId);
    assert.equal(completedJob.status, 'COMPLETED');

    const listResponse = await fetch(`${baseUrl}/learning/quizzes?documentId=${document.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(listResponse.status, 200);
    const listJson = await listResponse.json();
    assert.equal(listJson.quizzes.length, 1);

    const quizId = listJson.quizzes[0].id as string;
    const detailResponse = await fetch(`${baseUrl}/learning/quizzes/${quizId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    assert.equal(detailResponse.status, 200);
    const detailJson = await detailResponse.json();
    assert.equal(detailJson.questions.length, 4);
    assert.equal('correctIndex' in detailJson.questions[0], false);

    const storedQuiz = await Quiz.findById(quizId).lean();
    assert.ok(storedQuiz);
    const answers = storedQuiz.questions.map((question, index) =>
      index === 0 ? question.correctIndex : (question.correctIndex + 1) % question.options.length,
    );

    const submitResponse = await fetch(`${baseUrl}/learning/quizzes/${quizId}/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ answers }),
    });
    assert.equal(submitResponse.status, 200);
    const submitJson = await submitResponse.json();
    assert.equal(submitJson.totalQuestions, 4);
    assert.equal(submitJson.score, 1);
    assert.equal(submitJson.results.length, 4);

    const attemptCount = await QuizAttempt.countDocuments({ quizId: storedQuiz._id, userId: user._id });
    assert.equal(attemptCount, 1);

    console.log(JSON.stringify({
      jobId: enqueueJson.jobId,
      quizId,
      listedQuizzes: listJson.quizzes.length,
      submittedScore: submitJson.score,
      totalQuestions: submitJson.totalQuestions,
      attemptCount,
    }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await Promise.all([
      QuizAttempt.deleteMany({ userId: user._id }),
      Quiz.deleteMany({ documentId: document._id }),
      JobModel.deleteMany({ documentId: document._id }),
      DocumentChunk.deleteMany({ documentId: document._id }),
      Document.deleteMany({ _id: document._id }),
      User.deleteMany({ _id: user._id }),
    ]);

    await documentWorker.close();
    await closeDocumentQueue();
    await mongoose.disconnect();
  }
}

async function waitForCompletedJob(jobId: string) {
  const { default: JobModel } = await import('../src/modules/jobs/job.model.js');
  const startedAt = Date.now();

  while (Date.now() - startedAt < 30000) {
    const job = await JobModel.findById(jobId).lean();
    if (job?.status === 'COMPLETED') {
      return job;
    }

    if (job?.status === 'FAILED') {
      throw new Error(job.error ?? 'Quiz generation job failed');
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for quiz generation job');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
