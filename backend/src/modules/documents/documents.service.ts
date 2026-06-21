import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { S3CompatibleStorageProvider } from '../../common/storage/index.js';
import type { StorageProvider } from '../../common/storage/index.js';
import Document from './document.model.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf'];

const storageProvider: StorageProvider = new S3CompatibleStorageProvider();

const storage = multer.memoryStorage();

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
      status: 'UPLOADED',
      fileSize: file.size,
    });

    return document;
  }

  static async listDocuments(ownerId: string, options: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = options;
    const filter: Record<string, any> = { ownerId: new mongoose.Types.ObjectId(ownerId) };
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      Document.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
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
    }).lean();

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

    const key = path.basename(document.storageUrl);
    await storageProvider.delete(key);

    return document;
  }
}