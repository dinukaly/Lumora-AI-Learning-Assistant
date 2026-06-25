process.env.EMBEDDING_PROVIDER ??= 'local';
process.env.EMBEDDING_MODEL ??= 'Xenova/all-MiniLM-L6-v2';
process.env.EMBEDDING_DIMENSIONS ??= '384';

import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { io as createSocketClient } from 'socket.io-client';

const mongoose = (await import('mongoose')).default;
const { config } = await import('../src/config/index.js');
const app = (await import('../src/app.js')).default;
const User = (await import('../src/modules/users/user.model.js')).default;
const Document = (await import('../src/modules/documents/document.model.js')).default;
const Notification = (await import('../src/modules/notifications/notification.model.js')).default;
const { DocumentsService } = await import('../src/modules/documents/documents.service.js');
const { processDocumentChunking } = await import(
  '../src/modules/documents/document-chunking.service.js'
);
const { initializeSocketServer, SOCKET_EVENTS } = await import(
  '../src/common/realtime/socket.js'
);
const { generateAccessToken } = await import('../src/common/utils/jwt.js');

async function main() {
  await mongoose.connect(config.mongodb.uri);

  const server = createServer(app);
  initializeSocketServer(server);
  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address() as AddressInfo;
  const socketUrl = `http://127.0.0.1:${address.port}`;

  const user = await User.create({
    name: 'Socket Verify',
    email: `socket-verify-${Date.now()}@example.com`,
    passwordHash: 'secret123',
  });

  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
  });

  const socket = createSocketClient(socketUrl, {
    auth: { token: accessToken },
    transports: ['websocket'],
  });

  await waitForSocketConnect(socket);

  const readyNotificationPromise = waitForEvent(socket, SOCKET_EVENTS.notificationNew);
  const readyStatusPromise = waitForEvent(socket, SOCKET_EVENTS.documentStatus);

  const readyDocument = await Document.create({
    ownerId: user._id,
    title: 'Ready verification',
    originalFileName: 'ready-verification.pdf',
    storageUrl: 'local://ready-verification.pdf',
    status: 'PROCESSING',
    extractedPages: [
      {
        page: 1,
        text: 'Ribosomes build proteins. Cell membranes regulate transport across cells.',
      },
    ],
  });

  let failedDocumentId: string | null = null;

  try {
    await processDocumentChunking(readyDocument.id);

    const readyNotificationEvent = await readyNotificationPromise;
    const readyStatusEvent = await readyStatusPromise;
    const readyDocumentAfter = await Document.findById(readyDocument._id).select('status').lean();
    const storedReadyNotification = await Notification.findOne({
      'metadata.documentId': readyDocument.id,
      type: 'DOCUMENT_READY',
    })
      .sort({ createdAt: -1 })
      .lean();

    const failedNotificationPromise = waitForEvent(socket, SOCKET_EVENTS.notificationNew);
    const failedStatusPromise = waitForEvent(socket, SOCKET_EVENTS.documentStatus);

    const failedDocument = await Document.create({
      ownerId: user._id,
      title: 'Failed verification',
      originalFileName: 'failed-verification.pdf',
      storageUrl: 'local://failed-verification.pdf',
      status: 'PROCESSING',
    });
    failedDocumentId = failedDocument.id;

    await DocumentsService.markProcessingFailed(failedDocument.id, 'PDF had no extractable text');

    const failedNotificationEvent = await failedNotificationPromise;
    const failedStatusEvent = await failedStatusPromise;
    const failedDocumentAfter = await Document.findById(failedDocument._id)
      .select('status processingError')
      .lean();
    const storedFailedNotification = await Notification.findOne({
      'metadata.documentId': failedDocument.id,
      type: 'PROCESSING_FAILED',
    })
      .sort({ createdAt: -1 })
      .lean();

    console.log(
      JSON.stringify(
        {
          ready: {
            status: readyDocumentAfter?.status,
            notificationCreated: Boolean(storedReadyNotification),
            socketNotificationType: readyNotificationEvent?.notification?.type ?? null,
            socketStatus: readyStatusEvent?.status ?? null,
          },
          failed: {
            status: failedDocumentAfter?.status,
            processingError: failedDocumentAfter?.processingError ?? null,
            notificationCreated: Boolean(storedFailedNotification),
            socketNotificationType: failedNotificationEvent?.notification?.type ?? null,
            socketStatus: failedStatusEvent?.status ?? null,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    socket.disconnect();
    await Promise.all([
      Document.deleteMany({
        _id: {
          $in: [
            readyDocument._id,
            ...(failedDocumentId ? [new mongoose.Types.ObjectId(failedDocumentId)] : []),
          ],
        },
      }),
      Notification.deleteMany({ userId: user._id }),
      User.deleteOne({ _id: user._id }),
    ]);
    await mongoose.disconnect();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
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
  return new Promise<Record<string, any>>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for socket event "${event}"`));
    }, 20000);

    const onEvent = (payload: Record<string, any>) => {
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
}).finally(() => {
  process.exit();
});
