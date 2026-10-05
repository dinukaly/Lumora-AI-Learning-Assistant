process.env.CHAT_PROVIDER ??= 'mock';

import assert from 'node:assert/strict';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import mongoose from 'mongoose';
import { io as createSocketClient } from 'socket.io-client';
import app from '../src/app.js';
import { initializeSocketServer, SOCKET_EVENTS } from '../src/common/realtime/socket.js';
import { generateAccessToken } from '../src/common/utils/jwt.js';
import { connectDB } from '../src/config/db.js';
import DocumentChunk from '../src/modules/documents/document-chunk.model.js';
import Document from '../src/modules/documents/document.model.js';
import { DocumentsService } from '../src/modules/documents/documents.service.js';
import Flashcard from '../src/modules/learning/flashcard.model.js';
import { FlashcardGenerationService } from '../src/modules/learning/flashcard-generation.service.js';
import QuizAttempt from '../src/modules/learning/quiz-attempt.model.js';
import { QuizGenerationService } from '../src/modules/learning/quiz-generation.service.js';
import Quiz from '../src/modules/learning/quiz.model.js';
import Notification from '../src/modules/notifications/notification.model.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';
import User from '../src/modules/users/user.model.js';

async function main() {
  await connectDB();

  const server = createServer(app);
  initializeSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const [user, otherUser] = await Promise.all([
    User.create({
      name: 'Notifications Verifier',
      email: `verify-t62-${Date.now()}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
    }),
    User.create({
      name: 'Notifications Noise',
      email: `verify-t62-noise-${Date.now()}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
    }),
  ]);

  const accessToken = generateAccessToken({ userId: user.id, role: 'USER' });
  const socket = createSocketClient(baseUrl, {
    auth: { token: accessToken },
    transports: ['websocket'],
  });

  await waitForSocketConnect(socket);

  const [processingDocument, failedDocument, flashcardsDocument, quizDocument, otherDocument] = await Promise.all([
    Document.create({
      ownerId: user._id,
      title: 'Ready Notification Doc',
      originalFileName: 'ready-notification.pdf',
      storageUrl: 'https://example.com/ready-notification.pdf',
      status: 'PROCESSING',
      fileSize: 1024,
    }),
    Document.create({
      ownerId: user._id,
      title: 'Failed Notification Doc',
      originalFileName: 'failed-notification.pdf',
      storageUrl: 'https://example.com/failed-notification.pdf',
      status: 'PROCESSING',
      fileSize: 1024,
    }),
    Document.create({
      ownerId: user._id,
      title: 'Flashcards Notification Doc',
      originalFileName: 'flashcards-notification.pdf',
      storageUrl: 'https://example.com/flashcards-notification.pdf',
      status: 'READY',
      fileSize: 1024,
      summary: {
        text: 'React state and effects allow components to manage local behavior.',
        generatedFromChunks: true,
        generatedAt: new Date(),
      },
    }),
    Document.create({
      ownerId: user._id,
      title: 'Quiz Notification Doc',
      originalFileName: 'quiz-notification.pdf',
      storageUrl: 'https://example.com/quiz-notification.pdf',
      status: 'READY',
      fileSize: 1024,
      summary: {
        text: 'React hooks let function components use state and side effects.',
        generatedFromChunks: true,
        generatedAt: new Date(),
      },
    }),
    Document.create({
      ownerId: otherUser._id,
      title: 'Other User Notification Doc',
      originalFileName: 'other-user-notification.pdf',
      storageUrl: 'https://example.com/other-user-notification.pdf',
      status: 'READY',
      fileSize: 512,
    }),
  ]);

  await DocumentChunk.insertMany([
    {
      documentId: flashcardsDocument._id,
      chunkIndex: 0,
      text: 'useState adds local state to a function component.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 2,
      tokenCount: 10,
      metadata: { pageNumbers: [2], startPageNumber: 2, endPageNumber: 2 },
    },
    {
      documentId: flashcardsDocument._id,
      chunkIndex: 1,
      text: 'useEffect runs after render and reacts to dependency changes.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 3,
      tokenCount: 12,
      metadata: { pageNumbers: [3], startPageNumber: 3, endPageNumber: 3 },
    },
    {
      documentId: quizDocument._id,
      chunkIndex: 0,
      text: 'Hooks let React function components use local state and side effects.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 4,
      tokenCount: 11,
      metadata: { pageNumbers: [4], startPageNumber: 4, endPageNumber: 4 },
    },
    {
      documentId: quizDocument._id,
      chunkIndex: 1,
      text: 'Dependency arrays control when useEffect should run again.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 5,
      tokenCount: 10,
      metadata: { pageNumbers: [5], startPageNumber: 5, endPageNumber: 5 },
    },
  ]);

  const readyNotificationEventPromise = waitForEvent(socket, SOCKET_EVENTS.notificationNew);
  await DocumentsService.storeChunksAndMarkReady(processingDocument.id, [
    {
      chunkIndex: 0,
      text: 'Chunked text for readiness verification.',
      embedding: new Array(384).fill(0.1),
      pageNumber: 1,
      tokenCount: 6,
      metadata: { pageNumbers: [1], startPageNumber: 1, endPageNumber: 1 },
    },
  ]);
  const readyNotificationEvent = await readyNotificationEventPromise;
  assert.equal(readyNotificationEvent.notification.type, 'DOCUMENT_READY');

  const failedNotificationEventPromise = waitForEvent(socket, SOCKET_EVENTS.notificationNew);
  await DocumentsService.markProcessingFailed(failedDocument.id, 'PDF had no extractable text');
  const failedNotificationEvent = await failedNotificationEventPromise;
  assert.equal(failedNotificationEvent.notification.type, 'PROCESSING_FAILED');

  const flashcardsNotificationEventPromise = waitForEvent(socket, SOCKET_EVENTS.notificationNew);
  const flashcardResult = await FlashcardGenerationService.generateForDocument({
    userId: user.id,
    documentId: flashcardsDocument.id,
    count: 2,
  });
  const flashcardsNotificationEvent = await flashcardsNotificationEventPromise;
  assert.equal(flashcardsNotificationEvent.notification.type, 'FLASHCARDS_READY');

  const quizNotificationEventPromise = waitForEvent(socket, SOCKET_EVENTS.notificationNew);
  const quizResult = await QuizGenerationService.generateForDocument({
    userId: user.id,
    documentId: quizDocument.id,
    questionCount: 3,
    difficulty: 'MEDIUM',
  });
  const quizNotificationEvent = await quizNotificationEventPromise;
  assert.equal(quizNotificationEvent.notification.type, 'QUIZ_READY');

  const otherUserNotification = await NotificationsService.createNotification({
    userId: otherUser.id,
    type: 'SYSTEM',
    title: 'Noise notification',
    body: 'This should not appear in the verified user feed.',
  });

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
  };

  const listResponse = await fetch(`${baseUrl}/api/v1/notifications?page=1&limit=10`, {
    headers: authHeaders,
  });
  assert.equal(listResponse.status, 200);
  const listJson = await listResponse.json();
  assert.equal(listJson.notifications.length, 4);
  assert.equal(listJson.unreadCount, 4);
  assert.equal(listJson.total, 4);

  const types = new Set(listJson.notifications.map((notification: { type: string }) => notification.type));
  assert.equal(types.has('DOCUMENT_READY'), true);
  assert.equal(types.has('PROCESSING_FAILED'), true);
  assert.equal(types.has('FLASHCARDS_READY'), true);
  assert.equal(types.has('QUIZ_READY'), true);

  const unreadOnlyResponse = await fetch(`${baseUrl}/api/v1/notifications?unreadOnly=true&page=1&limit=10`, {
    headers: authHeaders,
  });
  assert.equal(unreadOnlyResponse.status, 200);
  const unreadOnlyJson = await unreadOnlyResponse.json();
  assert.equal(unreadOnlyJson.total, 4);

  const markReadTargetId = listJson.notifications[0].id as string;
  const markReadResponse = await fetch(`${baseUrl}/api/v1/notifications/${markReadTargetId}/read`, {
    method: 'PATCH',
    headers: authHeaders,
  });
  assert.equal(markReadResponse.status, 200);
  const markReadJson = await markReadResponse.json();
  assert.equal(markReadJson.id, markReadTargetId);
  assert.equal(typeof markReadJson.readAt, 'string');

  const otherUserReadResponse = await fetch(`${baseUrl}/api/v1/notifications/${otherUserNotification.id}/read`, {
    method: 'PATCH',
    headers: authHeaders,
  });
  assert.equal(otherUserReadResponse.status, 404);

  const afterSingleReadResponse = await fetch(`${baseUrl}/api/v1/notifications?unreadOnly=true&page=1&limit=10`, {
    headers: authHeaders,
  });
  assert.equal(afterSingleReadResponse.status, 200);
  const afterSingleReadJson = await afterSingleReadResponse.json();
  assert.equal(afterSingleReadJson.unreadCount, 3);
  assert.equal(afterSingleReadJson.total, 3);

  const markAllResponse = await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
    method: 'PATCH',
    headers: authHeaders,
  });
  assert.equal(markAllResponse.status, 200);
  const markAllJson = await markAllResponse.json();
  assert.equal(markAllJson.message, 'All notifications marked as read');

  const afterReadAllResponse = await fetch(`${baseUrl}/api/v1/notifications?page=1&limit=10`, {
    headers: authHeaders,
  });
  assert.equal(afterReadAllResponse.status, 200);
  const afterReadAllJson = await afterReadAllResponse.json();
  assert.equal(afterReadAllJson.unreadCount, 0);
  assert.equal(afterReadAllJson.total, 4);

  console.log(JSON.stringify({
    notificationTypes: Array.from(types).sort(),
    unreadCountBeforeRead: listJson.unreadCount,
    unreadCountAfterSingleRead: afterSingleReadJson.unreadCount,
    unreadCountAfterReadAll: afterReadAllJson.unreadCount,
    flashcardCount: flashcardResult.createdCount,
    quizQuestionCount: quizResult.questionCount,
  }, null, 2));

  socket.disconnect();

  await Promise.all([
    QuizAttempt.deleteMany({ quizId: quizResult.quizId }),
    Quiz.deleteMany({ _id: quizResult.quizId }),
    Flashcard.deleteMany({ documentId: flashcardsDocument._id }),
    DocumentChunk.deleteMany({
      documentId: { $in: [processingDocument._id, flashcardsDocument._id, quizDocument._id] },
    }),
    Notification.deleteMany({ userId: { $in: [user._id, otherUser._id] } }),
    Document.deleteMany({
      _id: {
        $in: [
          processingDocument._id,
          failedDocument._id,
          flashcardsDocument._id,
          quizDocument._id,
          otherDocument._id,
        ],
      },
    }),
    User.deleteMany({ _id: { $in: [user._id, otherUser._id] } }),
  ]);

  await mongoose.disconnect();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function waitForSocketConnect(socket: ReturnType<typeof createSocketClient>) {
  if (socket.connected) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for Socket.IO connection'));
    }, 10000);

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
  });
}

function waitForEvent(socket: ReturnType<typeof createSocketClient>, event: string) {
  return new Promise<{ notification: { type: string } }>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for socket event "${event}"`));
    }, 20000);

    const onEvent = (payload: { notification: { type: string } }) => {
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, onEvent);
    };

    socket.on(event, onEvent);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
