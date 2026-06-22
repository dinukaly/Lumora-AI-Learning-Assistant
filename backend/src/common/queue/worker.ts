import { Worker, Job as BullJob } from 'bullmq';
import { S3CompatibleStorageProvider } from '../storage/index.js';
import { DocumentsService } from '../../modules/documents/documents.service.js';
import JobModel from '../../modules/jobs/job.model.js';
import {
  DOCUMENT_QUEUE_NAME,
  TEXT_EXTRACTION_JOB,
  TextExtractionJobData,
  redisConnection,
} from './index.js';
import { extractPdfWithPython } from './python-extraction.js';

const storageProvider = new S3CompatibleStorageProvider();

async function setProgress(job: BullJob<TextExtractionJobData>, progress: number) {
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

export const documentWorker = new Worker<TextExtractionJobData>(
  DOCUMENT_QUEUE_NAME,
  async (job) => {
    if (job.name !== TEXT_EXTRACTION_JOB) {
      throw new Error(`Unsupported document-processing job type: ${job.name}`);
    }

    return processTextExtraction(job);
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
