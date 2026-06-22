import mongoose, { Schema, Document } from 'mongoose';

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export interface ISummary {
  text: string;
  generatedFromChunks: boolean;
  batchCount?: number;
  generatedAt: Date;
}

export interface IExtractedPage {
  page: number;
  text: string;
}

export interface IDocument extends Document {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  originalFileName: string;
  storageUrl: string;
  status: DocumentStatus;
  pageCount?: number;
  extractedText?: string;
  extractedPages?: IExtractedPage[];
  extractedAt?: Date;
  fileSize?: number;
  subjectTag?: string;
  summary?: ISummary;
  processingError?: string;
  flashcardCount?: number;
  quizCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema: Schema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    originalFileName: { type: String, required: true },
    storageUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ['UPLOADED', 'PROCESSING', 'READY', 'FAILED'],
      default: 'UPLOADED',
      required: true,
    },
    pageCount: { type: Number },
    extractedText: { type: String },
    extractedPages: {
      type: [
        {
          _id: false,
          page: { type: Number, required: true },
          text: { type: String, required: true },
        },
      ],
      default: undefined,
    },
    extractedAt: { type: Date },
    fileSize: { type: Number },
    subjectTag: { type: String, trim: true },
    summary: {
      type: {
        text: { type: String, required: true },
        generatedFromChunks: { type: Boolean, default: true },
        batchCount: { type: Number },
        generatedAt: { type: Date, required: true },
      },
      default: undefined,
    },
    processingError: { type: String },
    flashcardCount: { type: Number, default: 0 },
    quizCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

DocumentSchema.index({ ownerId: 1, createdAt: -1 });
DocumentSchema.index({ status: 1 });

export default mongoose.model<IDocument>('Document', DocumentSchema);
