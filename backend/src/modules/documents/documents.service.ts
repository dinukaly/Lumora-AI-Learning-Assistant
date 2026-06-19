import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Document from './document.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(__dirname, '../../../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

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
    const document = await Document.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      title,
      originalFileName: file.originalname,
      storageUrl: `/uploads/${file.filename}`,
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

    const filePath = path.join(UPLOADS_DIR, path.basename(document.storageUrl));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return document;
  }
}