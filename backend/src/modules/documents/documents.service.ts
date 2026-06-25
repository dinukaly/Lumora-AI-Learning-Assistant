import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { S3CompatibleStorageProvider } from '../../common/storage/index.js';
import type { StorageProvider } from '../../common/storage/index.js';
import { enqueueTextExtraction } from '../../common/queue/index.js';
import Document from './document.model.js';
import DocumentChunk from './document-chunk.model.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf'];

const storageProvider: StorageProvider = new S3CompatibleStorageProvider();

const storage = multer.memoryStorage();

export interface DocumentChunkWriteInput {
  chunkIndex: number;
  text: string;
  embedding: number[];
  pageNumber: number;
  tokenCount: number;
  metadata: {
    pageNumbers: number[];
    startPageNumber: number;
    endPageNumber: number;
  };
}

function storageKeyFromUrl(storageUrl: string) {
  try {
    const pathname = new URL(storageUrl).pathname;
    const key = pathname.split('/').filter(Boolean).at(-1);
    if (key) return decodeURIComponent(key);
  } catch {
    // A storage provider may return a key instead of a URL.
  }

  return path.basename(storageUrl);
}

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

export class DocumentsService {
  static async createDocumentRecord(
    ownerId: string,
    title: string,
    file: Express.Multer.File,
  ) {
    const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;

    const storageUrl = await storageProvider.upload(uniqueName, file.buffer, file.mimetype);

    const document = await Document.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      title,
      originalFileName: file.originalname,
      storageUrl,
      status: 'PROCESSING',
      fileSize: file.size,
    });

    try {
      await enqueueTextExtraction(document.id, uniqueName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue document processing';
      document.status = 'FAILED';
      document.processingError = message;
      await document.save();
      throw error;
    }

    return document;
  }

  static async markExtractionRunning(documentId: string) {
    return Document.findByIdAndUpdate(
      documentId,
      {
        status: 'PROCESSING',
        $unset: { processingError: 1 },
      },
      { new: true },
    );
  }

  static async markChunkingRunning(documentId: string) {
    return Document.findByIdAndUpdate(
      documentId,
      {
        status: 'PROCESSING',
        $unset: { processingError: 1 },
      },
      { new: true },
    );
  }

  static async storeExtractedContent(
    documentId: string,
    extraction: {
      pageCount: number;
      text: string;
      pages: Array<{ page: number; text: string }>;
    },
  ) {
    const document = await Document.findByIdAndUpdate(
      documentId,
      {
        status: 'PROCESSING',
        pageCount: extraction.pageCount,
        extractedText: extraction.text,
        extractedPages: extraction.pages,
        extractedAt: new Date(),
        $unset: { processingError: 1 },
      },
      { new: true, runValidators: true },
    );

    if (!document) {
      throw new Error('Document not found during extraction');
    }

    return document;
  }

  static async markProcessingFailed(documentId: string, error: string) {
    const document = await Document.findByIdAndUpdate(
      documentId,
      {
        status: 'FAILED',
        processingError: error,
      },
      { new: true },
    );

    if (document) {
      await NotificationsService.notifyDocumentFailed({
        userId: document.ownerId.toString(),
        documentId: document.id,
        title: document.title,
        originalFileName: document.originalFileName,
        error,
      });
    }

    return document;
  }

  static async getDocumentForChunking(documentId: string) {
    const document = await Document.findById(documentId).lean();

    if (!document) {
      throw new Error('Document not found during chunking');
    }

    return document;
  }

  static async storeChunksAndMarkReady(documentId: string, chunks: DocumentChunkWriteInput[]) {
    const objectId = new mongoose.Types.ObjectId(documentId);

    await DocumentChunk.deleteMany({ documentId: objectId });

    if (chunks.length > 0) {
      await DocumentChunk.insertMany(
        chunks.map((chunk) => ({
          documentId: objectId,
          ...chunk,
        })),
      );
    }

    const document = await Document.findByIdAndUpdate(
      documentId,
      {
        status: 'READY',
        $unset: { processingError: 1 },
      },
      { new: true, runValidators: true },
    );

    if (!document) {
      throw new Error('Document not found while marking chunking complete');
    }

    await NotificationsService.notifyDocumentReady({
      userId: document.ownerId.toString(),
      documentId: document.id,
      title: document.title,
      originalFileName: document.originalFileName,
    });

    return document;
  }

  static async listDocuments(ownerId: string, options: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = options;
    const filter: Record<string, unknown> = {
      ownerId: new mongoose.Types.ObjectId(ownerId),
    };
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      Document.find(filter)
        .select('-extractedText -extractedPages')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Document.countDocuments(filter),
    ]);

    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getDocumentById(documentId: string, ownerId: string) {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      throw new Error('Invalid document ID');
    }

    const document = await Document.findOne({
      _id: documentId,
      ownerId: new mongoose.Types.ObjectId(ownerId),
    })
      .select('-extractedText -extractedPages')
      .lean();

    if (!document) {
      throw new Error('Document not found');
    }

    return document;
  }

  static async deleteDocument(documentId: string, ownerId: string) {
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      throw new Error('Invalid document ID');
    }

    const document = await Document.findOneAndDelete({
      _id: documentId,
      ownerId: new mongoose.Types.ObjectId(ownerId),
    });

    if (!document) {
      throw new Error('Document not found');
    }

    const key = storageKeyFromUrl(document.storageUrl);
    await Promise.all([
      storageProvider.delete(key),
      DocumentChunk.deleteMany({ documentId: document._id }),
    ]);

    return document;
  }
}
