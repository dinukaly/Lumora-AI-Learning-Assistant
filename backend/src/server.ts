import app from './app.js';
import { config } from './config/index.js';
import { createServer } from 'http';
import { initializeSocketServer, closeSocketServer } from './common/realtime/socket.js';
import { initializeRuntime } from './bootstrap/runtime.js';
import { disconnectDB } from './config/db.js';
import { closeDocumentQueue } from './common/queue/index.js';
import { closeReadinessRedisClient } from './common/health/readiness.js';

const startServer = async () => {
  try {
    await initializeRuntime({ role: 'api' });

    const httpServer = createServer(app);
    initializeSocketServer(httpServer);

    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}. Shutting down API process...`);

      await closeSocketServer();

      httpServer.close(async () => {
        await Promise.allSettled([
          closeDocumentQueue(),
          closeReadinessRedisClient(),
          disconnectDB(),
        ]);

        process.exit(0);
      });
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    httpServer.listen(config.port, () => {
      console.log(`API server running in ${config.env} mode on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start API server', error);
    await Promise.allSettled([closeReadinessRedisClient(), disconnectDB()]);
    process.exit(1);
  }
};

startServer();
