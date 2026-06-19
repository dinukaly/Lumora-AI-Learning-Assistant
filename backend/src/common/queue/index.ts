import { Queue, ConnectionOptions } from 'bullmq';
import { config } from '../../config/index.js';

export const redisConnection: ConnectionOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

export const documentQueue = new Queue('document-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
