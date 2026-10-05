import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../src/app.js';
import {
  closeDocumentQueue,
  getDocumentQueue,
  setDocumentQueueForTesting,
  type DocumentQueueClient,
  type DocumentQueueJobData,
  type DocumentQueueJobHandle,
} from '../src/common/queue/index.js';
import { generateAccessToken } from '../src/common/utils/jwt.js';
import { connectDB } from '../src/config/db.js';
import Conversation from '../src/modules/conversations/conversation.model.js';
import Message from '../src/modules/conversations/message.model.js';
import Document from '../src/modules/documents/document.model.js';
import { DocumentsService } from '../src/modules/documents/documents.service.js';
import DocumentChunk from '../src/modules/documents/document-chunk.model.js';
import Flashcard from '../src/modules/learning/flashcard.model.js';
import Quiz from '../src/modules/learning/quiz.model.js';
import QuizAttempt from '../src/modules/learning/quiz-attempt.model.js';
import JobModel from '../src/modules/jobs/job.model.js';
import type { StorageProvider } from '../src/common/storage/storage-provider.interface.js';
import User from '../src/modules/users/user.model.js';

const mockStorageProvider: StorageProvider = {
  async upload() {
    return 'https://example.com/mock-upload.pdf';
  },
  async download() {
    return Buffer.from('');
  },
  async delete() {
    return undefined;
  },
};

function createMockQueue(): DocumentQueueClient {
  const jobs = new Map<string, MockQueueJob>();

  return {
    async add(name, data, options) {
      const id = options?.jobId ?? `mock-job-${jobs.size + 1}`;
      const job = new MockQueueJob(id, name, data);
      jobs.set(id, job);
      return job;
    },
    async getJob(jobId) {
      return jobs.get(jobId) ?? null;
    },
    async close() {
      jobs.clear();
    },
  };
}

class MockQueueJob implements DocumentQueueJobHandle {
  private state = 'failed';

  constructor(
    public id: string,
    public name: string,
    public data: DocumentQueueJobData,
  ) {}

  async retry() {
    this.state = 'waiting';
  }

  async getState() {
    return this.state;
  }

  async remove() {
    this.state = 'removed';
  }
}

async function main() {
  await connectDB();
  DocumentsService.setStorageProviderForTesting(mockStorageProvider);
  setDocumentQueueForTesting(createMockQueue());

  const timestamp = Date.now();
  const [adminUser, ownerUser, regularUser] = await Promise.all([
    User.create({
      name: 'Admin Docs Verifier',
      email: `verify-t72-admin-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'ADMIN',
    }),
    User.create({
      name: 'Owner User',
      email: `verify-t72-owner-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
    }),
    User.create({
      name: 'Regular User',
      email: `verify-t72-regular-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
    }),
  ]);

  const [deletableDocument, retainedDocument] = await Promise.all([
    Document.create({
      ownerId: ownerUser._id,
      title: 'Admin Deletable Document',
      originalFileName: 'admin-deletable.pdf',
      storageKey: 'admin-deletable.pdf',
      storageUrl: 'https://example.com/admin-deletable.pdf',
      status: 'READY',
      fileSize: 1024,
      flashcardCount: 1,
      quizCount: 1,
    }),
    Document.create({
      ownerId: regularUser._id,
      title: 'Admin Retry Document',
      originalFileName: 'admin-retry.pdf',
      storageKey: 'admin-retry.pdf',
      storageUrl: 'https://example.com/admin-retry.pdf',
      status: 'FAILED',
      fileSize: 2048,
      processingError: 'Initial extraction failed',
    }),
  ]);

  const [conversation, quiz] = await Promise.all([
    Conversation.create({
      userId: ownerUser._id,
      documentId: deletableDocument._id,
      title: 'Delete Me Conversation',
    }),
    Quiz.create({
      documentId: deletableDocument._id,
      title: 'Delete Me Quiz',
      createdBy: 'AI',
      questions: [
        {
          question: 'What is deleted?',
          options: ['Conversation', 'Nothing'],
          correctIndex: 0,
          explanation: 'Conversation linked to the document is deleted.',
        },
      ],
    }),
  ]);

  await Promise.all([
    DocumentChunk.create({
      documentId: deletableDocument._id,
      chunkIndex: 0,
      text: 'Chunk tied to deletable document.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 1,
      tokenCount: 6,
      metadata: { pageNumbers: [1], startPageNumber: 1, endPageNumber: 1 },
    }),
    Flashcard.create({
      documentId: deletableDocument._id,
      userId: ownerUser._id,
      front: 'Delete front',
      back: 'Delete back',
      difficulty: 'MEDIUM',
      nextReviewAt: new Date(),
      reviewCount: 0,
      successCount: 0,
    }),
    Message.create({
      conversationId: conversation._id,
      role: 'user',
      content: 'Delete this conversation.',
    }),
    QuizAttempt.create({
      userId: ownerUser._id,
      quizId: quiz._id,
      answers: [0],
      score: 1,
      totalQuestions: 1,
      completedAt: new Date(),
    }),
    JobModel.create({
      type: 'QUIZ_GENERATION',
      status: 'FAILED',
      progress: 100,
      attempts: 3,
      error: 'Prior quiz generation failed',
      documentId: deletableDocument._id,
      payload: {
        userId: ownerUser.id,
        documentId: deletableDocument.id,
        questionCount: 5,
        difficulty: 'MEDIUM',
      },
    }),
  ]);

  const retryJobRecord = await JobModel.create({
    type: 'TEXT_EXTRACTION',
    status: 'FAILED',
    progress: 100,
    attempts: 3,
    error: 'Storage fetch failed',
    documentId: retainedDocument._id,
    payload: {
      documentId: retainedDocument.id,
      storageKey: 'admin-retry.pdf',
    },
  });

  const adminToken = generateAccessToken({ userId: adminUser.id, role: 'ADMIN' });
  const regularToken = generateAccessToken({ userId: regularUser.id, role: 'USER' });
  const server = app.listen(0);
  const queuedBullJobIds: string[] = [];

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine verification server port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const forbiddenResponse = await fetch(`${baseUrl}/api/v1/admin/documents`, {
      headers: {
        Authorization: `Bearer ${regularToken}`,
      },
    });
    assert.equal(forbiddenResponse.status, 403);

    const documentsResponse = await fetch(
      `${baseUrl}/api/v1/admin/documents?ownerId=${ownerUser.id}&status=READY&page=1&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );
    assert.equal(documentsResponse.status, 200);
    const documentsJson = await documentsResponse.json();
    assert.equal(documentsJson.total, 1);
    assert.equal(documentsJson.documents[0].id, deletableDocument.id);
    assert.equal(documentsJson.documents[0].owner.email, ownerUser.email);

    const deleteResponse = await fetch(`${baseUrl}/api/v1/admin/documents/${deletableDocument.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert.equal(deleteResponse.status, 200);

    const [
      deletedDocumentCount,
      deletedChunkCount,
      deletedFlashcardCount,
      deletedConversationCount,
      deletedMessageCount,
      deletedQuizCount,
      deletedQuizAttemptCount,
      deletedJobCount,
    ] = await Promise.all([
      Document.countDocuments({ _id: deletableDocument._id }),
      DocumentChunk.countDocuments({ documentId: deletableDocument._id }),
      Flashcard.countDocuments({ documentId: deletableDocument._id }),
      Conversation.countDocuments({ documentId: deletableDocument._id }),
      Message.countDocuments({ conversationId: conversation._id }),
      Quiz.countDocuments({ _id: quiz._id }),
      QuizAttempt.countDocuments({ quizId: quiz._id }),
      JobModel.countDocuments({ documentId: deletableDocument._id }),
    ]);

    assert.equal(deletedDocumentCount, 0);
    assert.equal(deletedChunkCount, 0);
    assert.equal(deletedFlashcardCount, 0);
    assert.equal(deletedConversationCount, 0);
    assert.equal(deletedMessageCount, 0);
    assert.equal(deletedQuizCount, 0);
    assert.equal(deletedQuizAttemptCount, 0);
    assert.equal(deletedJobCount, 0);

    const jobsResponse = await fetch(
      `${baseUrl}/api/v1/admin/jobs?status=FAILED&type=TEXT_EXTRACTION&page=1&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );
    assert.equal(jobsResponse.status, 200);
    const jobsJson = await jobsResponse.json();
    assert.equal(
      jobsJson.jobs.some((job: { id: string }) => job.id === retryJobRecord.id),
      true,
    );

    const listedRetryJob = jobsJson.jobs.find((job: { id: string }) => job.id === retryJobRecord.id);
    assert.equal(listedRetryJob.document.owner.email, regularUser.email);

    const retryResponse = await fetch(`${baseUrl}/api/v1/admin/jobs/${retryJobRecord.id}/retry`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert.equal(retryResponse.status, 200);
    const retryJson = await retryResponse.json();
    assert.equal(retryJson.status, 'QUEUED');
    assert.equal(typeof retryJson.bullJobId, 'string');
    queuedBullJobIds.push(retryJson.bullJobId);

    const queuedBullJob = await getDocumentQueue().getJob(retryJson.bullJobId);
    assert.notEqual(queuedBullJob, null);
    assert.equal(queuedBullJob?.name, 'TEXT_EXTRACTION');
    assert.equal(queuedBullJob?.data.documentId, retainedDocument.id);

    console.log(JSON.stringify({
      filteredDocumentId: documentsJson.documents[0].id,
      deletedRelatedRecords: true,
      retriedJobId: retryJson.id,
      retriedBullJobId: retryJson.bullJobId,
    }, null, 2));
  } finally {
    for (const bullJobId of queuedBullJobIds) {
      const bullJob = await getDocumentQueue().getJob(bullJobId);
      if (bullJob) {
        await bullJob.remove();
      }
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await Promise.all([
      JobModel.deleteMany({ _id: retryJobRecord._id }),
      QuizAttempt.deleteMany({ userId: ownerUser._id }),
      Message.deleteMany({ conversationId: conversation._id }),
      Conversation.deleteMany({ _id: conversation._id }),
      Flashcard.deleteMany({ documentId: { $in: [deletableDocument._id, retainedDocument._id] } }),
      DocumentChunk.deleteMany({ documentId: { $in: [deletableDocument._id, retainedDocument._id] } }),
      Quiz.deleteMany({ _id: quiz._id }),
      Document.deleteMany({ _id: { $in: [deletableDocument._id, retainedDocument._id] } }),
      User.deleteMany({ _id: { $in: [adminUser._id, ownerUser._id, regularUser._id] } }),
    ]);

    DocumentsService.resetStorageProviderForTesting();
    await closeDocumentQueue();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
