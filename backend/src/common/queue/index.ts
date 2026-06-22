import { Queue, ConnectionOptions } from 'bullmq';
import mongoose from 'mongoose';
import { config } from '../../config/index.js';
import JobModel from '../../modules/jobs/job.model.js';

export const DOCUMENT_QUEUE_NAME = 'document-processing';
export const TEXT_EXTRACTION_JOB = 'TEXT_EXTRACTION';

export interface TextExtractionJobData {
  documentId: string;
  jobRecordId: string;
  storageKey: string;
}

export const redisConnection: ConnectionOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

export const documentQueue = new Queue<TextExtractionJobData>(DOCUMENT_QUEUE_NAME, {
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

export async function enqueueTextExtraction(documentId: string, storageKey: string) {
  const jobRecord = await JobModel.create({
    type: TEXT_EXTRACTION_JOB,
    status: 'QUEUED',
    progress: 0,
    documentId: new mongoose.Types.ObjectId(documentId),
  });

  try {
    const bullJob = await documentQueue.add(
      TEXT_EXTRACTION_JOB,
      {
        documentId,
        jobRecordId: jobRecord.id,
        storageKey,
      },
      {
        jobId: `text-extraction-${documentId}`,
      },
    );

    jobRecord.bullJobId = bullJob.id;
    await jobRecord.save();
    return jobRecord;
  } catch (error) {
    jobRecord.status = 'FAILED';
    jobRecord.error = error instanceof Error ? error.message : 'Failed to enqueue extraction';
    await jobRecord.save();
    throw error;
  }
}
