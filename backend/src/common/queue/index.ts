import { Queue, ConnectionOptions } from 'bullmq';
import mongoose from 'mongoose';
import JobModel, { IJob } from '../../modules/jobs/job.model.js';
import { getRedisConnectionOptions } from '../redis/connection.js';

export const DOCUMENT_QUEUE_NAME = 'document-processing';
export const TEXT_EXTRACTION_JOB = 'TEXT_EXTRACTION';
export const CHUNKING_EMBEDDING_JOB = 'CHUNKING_EMBEDDING';
export const FLASHCARD_GENERATION_JOB = 'FLASHCARD_GENERATION';
export const QUIZ_GENERATION_JOB = 'QUIZ_GENERATION';

export interface TextExtractionJobData {
  documentId: string;
  jobRecordId: string;
  storageKey: string;
}

export interface ChunkingEmbeddingJobData {
  documentId: string;
  jobRecordId: string;
}

export interface FlashcardGenerationJobData {
  userId: string;
  documentId: string;
  jobRecordId: string;
  count: number;
  topic?: string;
}

export interface QuizGenerationJobData {
  userId: string;
  documentId: string;
  jobRecordId: string;
  questionCount: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  topic?: string;
}

export type DocumentQueueJobData =
  | TextExtractionJobData
  | ChunkingEmbeddingJobData
  | FlashcardGenerationJobData
  | QuizGenerationJobData;

export interface DocumentQueueJobHandle {
  id: string;
  name: string;
  data: DocumentQueueJobData;
  retry(): Promise<void>;
  getState(): Promise<string>;
  remove(): Promise<void>;
}

export interface DocumentQueueClient {
  add(
    name: string,
    data: DocumentQueueJobData,
    options?: { jobId?: string },
  ): Promise<DocumentQueueJobHandle>;
  getJob(jobId: string): Promise<DocumentQueueJobHandle | null>;
  close(): Promise<void>;
}

export const redisConnection: ConnectionOptions = getRedisConnectionOptions();

let documentQueueInstance: Queue<DocumentQueueJobData> | null = null;
let documentQueueOverride: DocumentQueueClient | null = null;

export function getDocumentQueue() {
  if (documentQueueOverride) {
    return documentQueueOverride;
  }

  if (!documentQueueInstance) {
    documentQueueInstance = new Queue<DocumentQueueJobData>(DOCUMENT_QUEUE_NAME, {
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
  }

  return documentQueueInstance;
}

export function setDocumentQueueForTesting(queue: DocumentQueueClient | null) {
  documentQueueOverride = queue;
}

export async function enqueueTextExtraction(documentId: string, storageKey: string) {
  const jobRecord = await JobModel.create({
    type: TEXT_EXTRACTION_JOB,
    status: 'QUEUED',
    progress: 0,
    documentId: new mongoose.Types.ObjectId(documentId),
    payload: {
      documentId,
      storageKey,
    },
  });

  try {
    const bullJob = await getDocumentQueue().add(
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

export async function enqueueChunkingEmbedding(documentId: string) {
  const objectId = new mongoose.Types.ObjectId(documentId);
  const jobId = `chunking-embedding-${documentId}`;

  const existingJobRecord = await JobModel.findOne({
    type: CHUNKING_EMBEDDING_JOB,
    documentId: objectId,
    status: { $in: ['QUEUED', 'RUNNING', 'RETRYING', 'COMPLETED'] },
  }).sort({ createdAt: -1 });

  const existingBullJob = await getDocumentQueue().getJob(jobId);
  if (existingJobRecord && existingBullJob) {
    if (existingJobRecord.bullJobId !== existingBullJob.id) {
      existingJobRecord.bullJobId = existingBullJob.id;
      await existingJobRecord.save();
    }

    return existingJobRecord;
  }

  const jobRecord = existingJobRecord
    ?? await JobModel.create({
      type: CHUNKING_EMBEDDING_JOB,
      status: 'QUEUED',
      progress: 0,
      documentId: objectId,
      payload: {
        documentId,
      },
    });

  try {
    const bullJob = existingBullJob
      ?? await getDocumentQueue().add(
        CHUNKING_EMBEDDING_JOB,
        {
          documentId,
          jobRecordId: jobRecord.id,
        },
        {
          jobId,
        },
      );

    jobRecord.status = 'QUEUED';
    jobRecord.progress = 0;
    jobRecord.bullJobId = bullJob.id;
    jobRecord.error = undefined;
    await jobRecord.save();
    return jobRecord;
  } catch (error) {
    jobRecord.status = 'FAILED';
    jobRecord.error = error instanceof Error ? error.message : 'Failed to enqueue chunking job';
    await jobRecord.save();
    throw error;
  }
}

export async function enqueueFlashcardGeneration(input: {
  userId: string;
  documentId: string;
  count: number;
  topic?: string;
}) {
  const objectId = new mongoose.Types.ObjectId(input.documentId);
  const jobRecord = await JobModel.create({
    type: FLASHCARD_GENERATION_JOB,
    status: 'QUEUED',
    progress: 0,
    documentId: objectId,
    payload: {
      userId: input.userId,
      documentId: input.documentId,
      count: input.count,
      topic: input.topic,
    },
  });

  try {
    const bullJob = await getDocumentQueue().add(
      FLASHCARD_GENERATION_JOB,
      {
        userId: input.userId,
        documentId: input.documentId,
        jobRecordId: jobRecord.id,
        count: input.count,
        topic: input.topic,
      },
      {
        jobId: `flashcard-generation-${input.documentId}-${jobRecord.id}`,
      },
    );

    jobRecord.bullJobId = bullJob.id;
    await jobRecord.save();
    return jobRecord;
  } catch (error) {
    jobRecord.status = 'FAILED';
    jobRecord.error = error instanceof Error ? error.message : 'Failed to enqueue flashcard generation';
    await jobRecord.save();
    throw error;
  }
}

export async function enqueueQuizGeneration(input: {
  userId: string;
  documentId: string;
  questionCount: number;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  topic?: string;
}) {
  const objectId = new mongoose.Types.ObjectId(input.documentId);
  const jobRecord = await JobModel.create({
    type: QUIZ_GENERATION_JOB,
    status: 'QUEUED',
    progress: 0,
    documentId: objectId,
    payload: {
      userId: input.userId,
      documentId: input.documentId,
      questionCount: input.questionCount,
      difficulty: input.difficulty,
      topic: input.topic,
    },
  });

  try {
    const bullJob = await getDocumentQueue().add(
      QUIZ_GENERATION_JOB,
      {
        userId: input.userId,
        documentId: input.documentId,
        jobRecordId: jobRecord.id,
        questionCount: input.questionCount,
        difficulty: input.difficulty,
        topic: input.topic,
      },
      {
        jobId: `quiz-generation-${input.documentId}-${jobRecord.id}`,
      },
    );

    jobRecord.bullJobId = bullJob.id;
    await jobRecord.save();
    return jobRecord;
  } catch (error) {
    jobRecord.status = 'FAILED';
    jobRecord.error = error instanceof Error ? error.message : 'Failed to enqueue quiz generation';
    await jobRecord.save();
    throw error;
  }
}

export async function closeDocumentQueue() {
  if (documentQueueOverride) {
    await documentQueueOverride.close();
    documentQueueOverride = null;
  }

  if (documentQueueInstance) {
    await documentQueueInstance.close();
    documentQueueInstance = null;
  }
}

export async function retryStoredJob(jobRecord: IJob) {
  const queue = getDocumentQueue();
  const existingBullJob = jobRecord.bullJobId ? await queue.getJob(jobRecord.bullJobId) : null;

  if (existingBullJob) {
    const state = await existingBullJob.getState();
    if (state === 'failed') {
      await existingBullJob.retry();
      jobRecord.status = 'QUEUED';
      jobRecord.progress = 0;
      jobRecord.error = undefined;
      jobRecord.bullJobId = existingBullJob.id;
      await jobRecord.save();
      return jobRecord;
    }
  }

  const jobData = buildStoredJobData(jobRecord);
  const bullJob = await queue.add(jobRecord.type, jobData, {
    jobId: buildRetryJobId(jobRecord),
  });

  jobRecord.status = 'QUEUED';
  jobRecord.progress = 0;
  jobRecord.error = undefined;
  jobRecord.bullJobId = bullJob.id;
  await jobRecord.save();
  return jobRecord;
}

function buildStoredJobData(jobRecord: IJob): DocumentQueueJobData {
  const payload = jobRecord.payload ?? {};

  switch (jobRecord.type) {
    case TEXT_EXTRACTION_JOB: {
      const storageKey = payload.storageKey;
      const documentId = payload.documentId ?? jobRecord.documentId?.toString();
      if (typeof storageKey !== 'string' || typeof documentId !== 'string') {
        throw new Error('Job payload is missing documentId or storageKey');
      }

      return {
        documentId,
        jobRecordId: jobRecord.id,
        storageKey,
      };
    }

    case CHUNKING_EMBEDDING_JOB: {
      const documentId = payload.documentId ?? jobRecord.documentId?.toString();
      if (typeof documentId !== 'string') {
        throw new Error('Job payload is missing documentId');
      }

      return {
        documentId,
        jobRecordId: jobRecord.id,
      };
    }

    case FLASHCARD_GENERATION_JOB: {
      const userId = payload.userId;
      const documentId = payload.documentId ?? jobRecord.documentId?.toString();
      const count = payload.count;
      if (typeof userId !== 'string' || typeof documentId !== 'string' || typeof count !== 'number') {
        throw new Error('Job payload is missing flashcard retry fields');
      }

      return {
        userId,
        documentId,
        jobRecordId: jobRecord.id,
        count,
        topic: typeof payload.topic === 'string' ? payload.topic : undefined,
      };
    }

    case QUIZ_GENERATION_JOB: {
      const userId = payload.userId;
      const documentId = payload.documentId ?? jobRecord.documentId?.toString();
      const questionCount = payload.questionCount;
      const difficulty = payload.difficulty;
      if (
        typeof userId !== 'string'
        || typeof documentId !== 'string'
        || typeof questionCount !== 'number'
      ) {
        throw new Error('Job payload is missing quiz retry fields');
      }

      return {
        userId,
        documentId,
        jobRecordId: jobRecord.id,
        questionCount,
        difficulty:
          difficulty === 'EASY' || difficulty === 'MEDIUM' || difficulty === 'HARD'
            ? difficulty
            : undefined,
        topic: typeof payload.topic === 'string' ? payload.topic : undefined,
      };
    }

    default:
      throw new Error(`Unsupported job type: ${jobRecord.type}`);
  }
}

function buildRetryJobId(jobRecord: IJob) {
  const normalizedType = jobRecord.type.toLowerCase().replace(/_/g, '-');
  const documentId = jobRecord.documentId?.toString() ?? 'no-document';
  return `${normalizedType}-${documentId}-${jobRecord.id}-${Date.now()}`;
}
