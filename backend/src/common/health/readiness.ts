import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { config } from '../../config/index.js';

let readinessRedisClient: Redis | null = null;

export async function getReadinessStatus() {
  const [mongodb, redis] = await Promise.all([
    checkMongoReadiness(),
    checkRedisReadiness(),
  ]);

  return {
    ready: mongodb.ok && redis.ok,
    checks: {
      mongodb,
      redis,
    },
  };
}

export async function closeReadinessRedisClient() {
  if (!readinessRedisClient) {
    return;
  }

  try {
    await readinessRedisClient.quit();
  } catch {
    readinessRedisClient.disconnect();
  } finally {
    readinessRedisClient = null;
  }
}

async function checkMongoReadiness() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return {
      ok: false,
      detail: `mongoose readyState=${mongoose.connection.readyState}`,
    };
  }

  try {
    await mongoose.connection.db.admin().command({ ping: 1 });
    return { ok: true, detail: 'ping ok' };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'MongoDB ping failed',
    };
  }
}

async function checkRedisReadiness() {
  try {
    const client = getReadinessRedisClient();
    if (client.status === 'wait') {
      await client.connect();
    }

    const response = await client.ping();
    return {
      ok: response === 'PONG',
      detail: response,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Redis ping failed',
    };
  }
}

function getReadinessRedisClient() {
  if (!readinessRedisClient) {
    readinessRedisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
    });
  }

  return readinessRedisClient;
}
