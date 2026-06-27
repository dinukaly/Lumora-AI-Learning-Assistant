import { Queue, ConnectionOptions } from 'bullmq';
import mongoose from 'mongoose';
import { config } from '../../config/index.js';
import JobModel from '../../modules/jobs/job.model.js';

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

export const redisConnection: ConnectionOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

let documentQueueInstance: Queue<DocumentQueueJobData> | null = null;

function getDocumentQueue() {
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

export async function enqueueTextExtraction(documentId: string, storageKey: string) {
  const jobRecord = await JobModel.create({
    type: TEXT_EXTRACTION_JOB,
    status: 'QUEUED',
    progress: 0,
    documentId: new mongoose.Types.ObjectId(documentId),
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
  if (documentQueueInstance) {
    await documentQueueInstance.close();
    documentQueueInstance = null;
  }
}
