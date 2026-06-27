import { Worker, Job as BullJob } from 'bullmq';
import { S3CompatibleStorageProvider } from '../storage/index.js';
import { DocumentsService } from '../../modules/documents/documents.service.js';
import { processDocumentChunking } from '../../modules/documents/document-chunking.service.js';
import JobModel from '../../modules/jobs/job.model.js';
import {
  CHUNKING_EMBEDDING_JOB,
  DOCUMENT_QUEUE_NAME,
  FLASHCARD_GENERATION_JOB,
  QUIZ_GENERATION_JOB,
  TEXT_EXTRACTION_JOB,
  ChunkingEmbeddingJobData,
  DocumentQueueJobData,
  FlashcardGenerationJobData,
  QuizGenerationJobData,
  TextExtractionJobData,
  enqueueChunkingEmbedding,
  redisConnection,
} from './index.js';
import { extractPdfWithPython } from './python-extraction.js';
import { FlashcardGenerationService } from '../../modules/learning/flashcard-generation.service.js';
import { QuizGenerationService } from '../../modules/learning/quiz-generation.service.js';

const storageProvider = new S3CompatibleStorageProvider();

async function setProgress(job: BullJob<DocumentQueueJobData>, progress: number) {
  await Promise.all([
    job.updateProgress(progress),
    JobModel.findByIdAndUpdate(job.data.jobRecordId, { progress }),
  ]);
}

async function processTextExtraction(job: BullJob<TextExtractionJobData>) {
  const { documentId, jobRecordId, storageKey } = job.data;

  await Promise.all([
    JobModel.findByIdAndUpdate(jobRecordId, {
      status: 'RUNNING',
      progress: 5,
      attempts: job.attemptsMade + 1,
      $unset: { error: 1 },
    }),
    DocumentsService.markExtractionRunning(documentId),
  ]);
  await job.updateProgress(5);

  try {
    const pdf = await storageProvider.download(storageKey);
    await setProgress(job, 25);

    const extraction = await extractPdfWithPython(pdf);
    await setProgress(job, 80);

    await DocumentsService.storeExtractedContent(documentId, extraction);
    await setProgress(job, 90);
    await enqueueChunkingEmbedding(documentId);
    await Promise.all([
      setProgress(job, 100),
      JobModel.findByIdAndUpdate(jobRecordId, {
        status: 'COMPLETED',
        progress: 100,
        $unset: { error: 1 },
      }),
    ]);

    return {
      documentId,
      pageCount: extraction.pageCount,
      characterCount: extraction.text.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown extraction failure';
    const maxAttempts = job.opts.attempts ?? 1;
    const attemptsAfterFailure = job.attemptsMade + 1;
    const willRetry = attemptsAfterFailure < maxAttempts;

    await JobModel.findByIdAndUpdate(jobRecordId, {
      status: willRetry ? 'RETRYING' : 'FAILED',
      error: message,
      attempts: attemptsAfterFailure,
    });

    if (!willRetry) {
      await DocumentsService.markProcessingFailed(documentId, message);
    }

    throw error;
  }
}

async function processChunkingEmbedding(job: BullJob<ChunkingEmbeddingJobData>) {
  const { documentId, jobRecordId } = job.data;

  await Promise.all([
    JobModel.findByIdAndUpdate(jobRecordId, {
      status: 'RUNNING',
      progress: 5,
      attempts: job.attemptsMade + 1,
      $unset: { error: 1 },
    }),
    DocumentsService.markChunkingRunning(documentId),
  ]);
  await job.updateProgress(5);

  try {
    const result = await processDocumentChunking(documentId, {
      onChunked: async () => {
        await setProgress(job, 20);
      },
      onEmbeddingBatch: async (completedBatches, totalBatches) => {
        const progress = 20 + Math.round((completedBatches / totalBatches) * 70);
        await setProgress(job, progress);
      },
      onStored: async () => {
        await setProgress(job, 95);
      },
    });

    await Promise.all([
      setProgress(job, 100),
      JobModel.findByIdAndUpdate(jobRecordId, {
        status: 'COMPLETED',
        progress: 100,
        $unset: { error: 1 },
      }),
    ]);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown chunking failure';
    const maxAttempts = job.opts.attempts ?? 1;
    const attemptsAfterFailure = job.attemptsMade + 1;
    const willRetry = attemptsAfterFailure < maxAttempts;

    await JobModel.findByIdAndUpdate(jobRecordId, {
      status: willRetry ? 'RETRYING' : 'FAILED',
      error: message,
      attempts: attemptsAfterFailure,
    });

    if (!willRetry) {
      await DocumentsService.markProcessingFailed(documentId, message);
    }

    throw error;
  }
}

async function processFlashcardGeneration(job: BullJob<FlashcardGenerationJobData>) {
  const { documentId, jobRecordId, userId, count, topic } = job.data;

  await Promise.all([
    JobModel.findByIdAndUpdate(jobRecordId, {
      status: 'RUNNING',
      progress: 5,
      attempts: job.attemptsMade + 1,
      $unset: { error: 1 },
    }),
    job.updateProgress(5),
  ]);

  try {
    const result = await FlashcardGenerationService.generateForDocument(
      { userId, documentId, count, topic },
      {
        onPrepared: async () => {
          await setProgress(job, 25);
        },
        onGenerated: async () => {
          await setProgress(job, 75);
        },
        onStored: async () => {
          await setProgress(job, 95);
        },
      },
    );

    await Promise.all([
      setProgress(job, 100),
      JobModel.findByIdAndUpdate(jobRecordId, {
        status: 'COMPLETED',
        progress: 100,
        $unset: { error: 1 },
      }),
    ]);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown flashcard generation failure';
    const maxAttempts = job.opts.attempts ?? 1;
    const attemptsAfterFailure = job.attemptsMade + 1;
    const willRetry = attemptsAfterFailure < maxAttempts;

    await JobModel.findByIdAndUpdate(jobRecordId, {
      status: willRetry ? 'RETRYING' : 'FAILED',
      error: message,
      attempts: attemptsAfterFailure,
    });

    throw error;
  }
}

async function processQuizGeneration(job: BullJob<QuizGenerationJobData>) {
  const { documentId, jobRecordId, userId, questionCount, difficulty, topic } = job.data;

  await Promise.all([
    JobModel.findByIdAndUpdate(jobRecordId, {
      status: 'RUNNING',
      progress: 5,
      attempts: job.attemptsMade + 1,
      $unset: { error: 1 },
    }),
    job.updateProgress(5),
  ]);

  try {
    const result = await QuizGenerationService.generateForDocument(
      { userId, documentId, questionCount, difficulty, topic },
      {
        onPrepared: async () => {
          await setProgress(job, 25);
        },
        onGenerated: async () => {
          await setProgress(job, 75);
        },
        onStored: async () => {
          await setProgress(job, 95);
        },
      },
    );

    await Promise.all([
      setProgress(job, 100),
      JobModel.findByIdAndUpdate(jobRecordId, {
        status: 'COMPLETED',
        progress: 100,
        $unset: { error: 1 },
      }),
    ]);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown quiz generation failure';
    const maxAttempts = job.opts.attempts ?? 1;
    const attemptsAfterFailure = job.attemptsMade + 1;
    const willRetry = attemptsAfterFailure < maxAttempts;

    await JobModel.findByIdAndUpdate(jobRecordId, {
      status: willRetry ? 'RETRYING' : 'FAILED',
      error: message,
      attempts: attemptsAfterFailure,
    });

    throw error;
  }
}

export const documentWorker = new Worker<DocumentQueueJobData>(
  DOCUMENT_QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case TEXT_EXTRACTION_JOB:
        return processTextExtraction(job as BullJob<TextExtractionJobData>);
      case CHUNKING_EMBEDDING_JOB:
        return processChunkingEmbedding(job as BullJob<ChunkingEmbeddingJobData>);
      case FLASHCARD_GENERATION_JOB:
        return processFlashcardGeneration(job as BullJob<FlashcardGenerationJobData>);
      case QUIZ_GENERATION_JOB:
        return processQuizGeneration(job as BullJob<QuizGenerationJobData>);
      default:
        throw new Error(`Unsupported document-processing job type: ${job.name}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);

documentWorker.on('completed', (job) => {
  console.log(`Document processing job ${job.id} completed`);
});

documentWorker.on('failed', (job, error) => {
  console.error(`Document processing job ${job?.id ?? 'unknown'} failed: ${error.message}`);
});
