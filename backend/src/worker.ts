import { initializeRuntime } from './bootstrap/runtime.js';
import { closeReadinessRedisClient } from './common/health/readiness.js';
import { closeDocumentQueue } from './common/queue/index.js';
import { startDocumentWorker, stopDocumentWorker } from './common/queue/worker.js';
import { disconnectDB } from './config/db.js';

async function startWorkerProcess() {
  try {
    await initializeRuntime({ role: 'worker' });
    startDocumentWorker();

    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}. Shutting down worker process...`);

      await Promise.allSettled([
        stopDocumentWorker(),
        closeDocumentQueue(),
        closeReadinessRedisClient(),
        disconnectDB(),
      ]);

      process.exit(0);
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    console.log('Document worker is running');
  } catch (error) {
    console.error('Failed to start worker process', error);
    await Promise.allSettled([closeReadinessRedisClient(), disconnectDB()]);
    process.exit(1);
  }
}

void startWorkerProcess();
