import { Worker, Job } from 'bullmq';
import { redisConnection } from './index.js';

export const documentWorker = new Worker(
  'document-processing',
  async (job: Job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);
    // Basic job processing logic will be added in subsequent tasks
    return { status: 'processed' };
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

documentWorker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed!`);
});

documentWorker.on('failed', (job, err) => {
  console.log(`Job ${job?.id} has failed with ${err.message}`);
});
