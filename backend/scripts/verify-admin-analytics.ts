import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { generateAccessToken } from '../src/common/utils/jwt.js';
import { connectDB } from '../src/config/db.js';
import UsageEvent from '../src/modules/analytics/usage-event.model.js';
import Document from '../src/modules/documents/document.model.js';
import User from '../src/modules/users/user.model.js';

async function main() {
  await connectDB();

  const now = new Date();
  const dayOne = new Date('2026-07-01T09:15:00.000Z');
  const dayOneLaterHour = new Date('2026-07-01T10:45:00.000Z');
  const dayTwo = new Date('2026-07-02T11:30:00.000Z');
  const oldLogin = new Date(now);
  oldLogin.setDate(oldLogin.getDate() - 45);
  const recentLogin = new Date(now);
  recentLogin.setDate(recentLogin.getDate() - 2);

  const timestamp = Date.now();
  const [adminUser, activeUser, inactiveUser, regularUser] = await Promise.all([
    User.create({
      name: 'Admin Analytics Verifier',
      email: `verify-t73-admin-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'ADMIN',
      lastLoginAt: recentLogin,
    }),
    User.create({
      name: 'Active Analyst',
      email: `verify-t73-active-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
      lastLoginAt: recentLogin,
    }),
    User.create({
      name: 'Inactive Analyst',
      email: `verify-t73-inactive-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
      lastLoginAt: oldLogin,
    }),
    User.create({
      name: 'Regular Viewer',
      email: `verify-t73-regular-${timestamp}@example.com`,
      passwordHash: 'password123',
      role: 'USER',
      lastLoginAt: recentLogin,
    }),
  ]);

  const documents = await Document.insertMany([
    {
      ownerId: activeUser._id,
      title: 'Ready Analytics Doc',
      originalFileName: 'ready-analytics.pdf',
      storageKey: 'ready-analytics.pdf',
      storageUrl: 'https://example.com/ready-analytics.pdf',
      status: 'READY',
      fileSize: 1024,
    },
    {
      ownerId: activeUser._id,
      title: 'Failed Analytics Doc',
      originalFileName: 'failed-analytics.pdf',
      storageKey: 'failed-analytics.pdf',
      storageUrl: 'https://example.com/failed-analytics.pdf',
      status: 'FAILED',
      fileSize: 1024,
      processingError: 'Extraction failed',
    },
    {
      ownerId: inactiveUser._id,
      title: 'Processing Analytics Doc',
      originalFileName: 'processing-analytics.pdf',
      storageKey: 'processing-analytics.pdf',
      storageUrl: 'https://example.com/processing-analytics.pdf',
      status: 'PROCESSING',
      fileSize: 1024,
    },
  ]);

  const [readyDocument] = documents;

  const usageEvents = await UsageEvent.insertMany([
    {
      userId: activeUser._id,
      actionType: 'CHAT',
      tokensUsed: 100,
      documentId: readyDocument._id,
      costEstimate: 0.1,
      createdAt: dayOne,
      updatedAt: dayOne,
    },
    {
      userId: activeUser._id,
      actionType: 'EXPLAIN_CONCEPT',
      tokensUsed: 50,
      documentId: readyDocument._id,
      costEstimate: 0.05,
      createdAt: dayOneLaterHour,
      updatedAt: dayOneLaterHour,
    },
    {
      userId: inactiveUser._id,
      actionType: 'SUMMARIZE_DOCUMENT',
      tokensUsed: 200,
      documentId: readyDocument._id,
      costEstimate: 0.2,
      createdAt: dayTwo,
      updatedAt: dayTwo,
    },
  ]);

  const adminToken = generateAccessToken({ userId: adminUser.id, role: 'ADMIN' });
  const regularToken = generateAccessToken({ userId: regularUser.id, role: 'USER' });
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine verification server port');
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const forbiddenStatsResponse = await fetch(`${baseUrl}/api/v1/admin/stats`, {
      headers: {
        Authorization: `Bearer ${regularToken}`,
      },
    });
    assert.equal(forbiddenStatsResponse.status, 403);

    const statsResponse = await fetch(`${baseUrl}/api/v1/admin/stats`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert.equal(statsResponse.status, 200);
    const statsJson = await statsResponse.json();
    assert.equal(statsJson.totalUsers >= 4, true);
    assert.equal(statsJson.activeUsers >= 3, true);
    assert.equal(statsJson.totalDocuments >= 3, true);
    assert.equal(statsJson.processingFailures >= 1, true);
    assert.equal(statsJson.totalAIRequests >= 3, true);
    assert.equal(statsJson.totalTokensUsed >= 350, true);
    assert.equal(statsJson.estimatedCost >= 0.35, true);

    const usageResponse = await fetch(
      `${baseUrl}/api/v1/admin/analytics/usage?from=2026-07-01T00:00:00.000Z&to=2026-07-02T23:59:59.999Z&granularity=day`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );
    assert.equal(usageResponse.status, 200);
    const usageJson = await usageResponse.json();
    assert.equal(usageJson.data.length, 2);
    assert.deepEqual(usageJson.data[0], {
      date: '2026-07-01',
      requests: 2,
      tokens: 150,
      cost: 0.15,
    });
    assert.deepEqual(usageJson.data[1], {
      date: '2026-07-02',
      requests: 1,
      tokens: 200,
      cost: 0.2,
    });

    const hourlyUsageResponse = await fetch(
      `${baseUrl}/api/v1/admin/analytics/usage?from=2026-07-01T00:00:00.000Z&to=2026-07-01T23:59:59.999Z&granularity=hour`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );
    assert.equal(hourlyUsageResponse.status, 200);
    const hourlyUsageJson = await hourlyUsageResponse.json();
    assert.deepEqual(hourlyUsageJson.data, [
      {
        date: '2026-07-01T09:00:00.000Z',
        requests: 1,
        tokens: 100,
        cost: 0.1,
      },
      {
        date: '2026-07-01T10:00:00.000Z',
        requests: 1,
        tokens: 50,
        cost: 0.05,
      },
    ]);

    const invalidRangeResponse = await fetch(
      `${baseUrl}/api/v1/admin/analytics/usage?from=2026-07-03T00:00:00.000Z&to=2026-07-02T00:00:00.000Z&granularity=day`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    );
    assert.equal(invalidRangeResponse.status, 400);

    console.log(JSON.stringify({
      stats: {
        totalUsers: statsJson.totalUsers,
        activeUsers: statsJson.activeUsers,
        totalDocuments: statsJson.totalDocuments,
        processingFailures: statsJson.processingFailures,
        totalAIRequests: statsJson.totalAIRequests,
        totalTokensUsed: statsJson.totalTokensUsed,
        estimatedCost: statsJson.estimatedCost,
      },
      dailyBuckets: usageJson.data,
      hourlyBuckets: hourlyUsageJson.data,
    }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await Promise.all([
      UsageEvent.deleteMany({ _id: { $in: usageEvents.map((event) => event._id) } }),
      Document.deleteMany({ _id: { $in: documents.map((document) => document._id) } }),
      User.deleteMany({
        _id: { $in: [adminUser._id, activeUser._id, inactiveUser._id, regularUser._id] },
      }),
    ]);

    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
