import assert from 'node:assert/strict';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import mongoose from 'mongoose';
import { io as createSocketClient } from 'socket.io-client';
import app from '../src/app.js';
import { closeSocketServer, initializeSocketServer, SOCKET_EVENTS } from '../src/common/realtime/socket.js';
import { generateAccessToken } from '../src/common/utils/jwt.js';
import { connectDB } from '../src/config/db.js';
import Notification from '../src/modules/notifications/notification.model.js';
import User from '../src/modules/users/user.model.js';

async function main() {
  await connectDB();

  const runId = `verify-t74-${Date.now()}`;
  const title = `Scheduled Maintenance ${runId}`;
  const body = `Lumora maintenance window ${runId}`;

  let server: ReturnType<typeof createServer> | null = null;
  const sockets: Array<ReturnType<typeof createSocketClient>> = [];
  const createdUserIds: mongoose.Types.ObjectId[] = [];

  try {
    server = createServer(app);
    initializeSocketServer(server);
    await new Promise<void>((resolve) => server!.listen(0, () => resolve()));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const [adminUser, learnerOne, learnerTwo] = await Promise.all([
      User.create({
        name: 'Broadcast Admin',
        email: `${runId}-admin@example.com`,
        passwordHash: 'password123',
        role: 'ADMIN',
      }),
      User.create({
        name: 'Broadcast Learner One',
        email: `${runId}-user-1@example.com`,
        passwordHash: 'password123',
        role: 'USER',
      }),
      User.create({
        name: 'Broadcast Learner Two',
        email: `${runId}-user-2@example.com`,
        passwordHash: 'password123',
        role: 'USER',
      }),
    ]);

    createdUserIds.push(adminUser._id, learnerOne._id, learnerTwo._id);

    const expectedRecipientCount = await User.countDocuments();

    const adminToken = generateAccessToken({ userId: adminUser.id, role: 'ADMIN' });
    const learnerOneToken = generateAccessToken({ userId: learnerOne.id, role: 'USER' });
    const learnerTwoToken = generateAccessToken({ userId: learnerTwo.id, role: 'USER' });

    const adminSocket = createSocketClient(baseUrl, {
      auth: { token: adminToken },
      transports: ['websocket'],
    });
    const learnerOneSocket = createSocketClient(baseUrl, {
      auth: { token: learnerOneToken },
      transports: ['websocket'],
    });
    const learnerTwoSocket = createSocketClient(baseUrl, {
      auth: { token: learnerTwoToken },
      transports: ['websocket'],
    });

    sockets.push(adminSocket, learnerOneSocket, learnerTwoSocket);
    await Promise.all(sockets.map((socket) => waitForSocketConnect(socket)));

    const nonAdminResponse = await fetch(`${baseUrl}/api/v1/admin/notifications/broadcast`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${learnerOneToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body }),
    });
    assert.equal(nonAdminResponse.status, 403);

    const adminEventPromise = waitForBroadcastEvent(adminSocket, title, body, adminUser.id);
    const learnerOneEventPromise = waitForBroadcastEvent(learnerOneSocket, title, body, adminUser.id);
    const learnerTwoEventPromise = waitForBroadcastEvent(learnerTwoSocket, title, body, adminUser.id);

    const broadcastResponse = await fetch(`${baseUrl}/api/v1/admin/notifications/broadcast`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body }),
    });
    assert.equal(broadcastResponse.status, 200);
    const broadcastJson = await broadcastResponse.json();

    assert.equal(broadcastJson.message, 'Broadcast notification sent successfully');
    assert.equal(broadcastJson.createdCount, expectedRecipientCount);

    await Promise.all([adminEventPromise, learnerOneEventPromise, learnerTwoEventPromise]);

    const storedNotifications = await Notification.find({ title, body }).lean();
    assert.equal(storedNotifications.length, expectedRecipientCount);

    const storedRecipientIds = new Set(storedNotifications.map((notification) => notification.userId.toString()));
    assert.equal(storedRecipientIds.has(adminUser.id), true);
    assert.equal(storedRecipientIds.has(learnerOne.id), true);
    assert.equal(storedRecipientIds.has(learnerTwo.id), true);

    const [adminFeed, learnerOneFeed, learnerTwoFeed] = await Promise.all([
      listNotifications(baseUrl, adminToken),
      listNotifications(baseUrl, learnerOneToken),
      listNotifications(baseUrl, learnerTwoToken),
    ]);

    assert.equal(containsBroadcast(adminFeed.notifications, title, body), true);
    assert.equal(containsBroadcast(learnerOneFeed.notifications, title, body), true);
    assert.equal(containsBroadcast(learnerTwoFeed.notifications, title, body), true);

    console.log(JSON.stringify({
      createdCount: broadcastJson.createdCount,
      verifiedSocketRecipients: [adminUser.email, learnerOne.email, learnerTwo.email],
      persistedRecipientCount: storedNotifications.length,
    }, null, 2));
  } finally {
    for (const socket of sockets) {
      socket.disconnect();
    }

    await Notification.deleteMany({ title, body });

    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }

    await closeSocketServer();

    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    await mongoose.disconnect();
  }
}

async function listNotifications(baseUrl: string, accessToken: string) {
  const response = await fetch(`${baseUrl}/api/v1/notifications?page=1&limit=20`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  assert.equal(response.status, 200);
  return response.json() as Promise<{
    notifications: Array<{
      type: string;
      title: string;
      body: string;
    }>;
  }>;
}

function containsBroadcast(
  notifications: Array<{ type: string; title: string; body: string }>,
  title: string,
  body: string,
) {
  return notifications.some((notification) => (
    notification.type === 'ADMIN_BROADCAST'
    && notification.title === title
    && notification.body === body
  ));
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

function waitForBroadcastEvent(
  socket: ReturnType<typeof createSocketClient>,
  expectedTitle: string,
  expectedBody: string,
  expectedAdminUserId: string,
) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for broadcast notification "${expectedTitle}"`));
    }, 20000);

    const onEvent = (payload: {
      notification: {
        type: string;
        title: string;
        body: string;
        metadata?: Record<string, unknown>;
      };
    }) => {
      if (
        payload.notification.type !== 'ADMIN_BROADCAST'
        || payload.notification.title !== expectedTitle
        || payload.notification.body !== expectedBody
      ) {
        return;
      }

      assert.equal(payload.notification.metadata?.createdBy, expectedAdminUserId);
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(SOCKET_EVENTS.notificationNew, onEvent);
    };

    socket.on(SOCKET_EVENTS.notificationNew, onEvent);
  });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
