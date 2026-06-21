import mongoose, { Schema, Document } from 'mongoose';

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export interface ISummary {
  text: string;
  generatedFromChunks: boolean;
  batchCount?: number;
  generatedAt: Date;
}

export interface IDocument extends Document {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  originalFileName: string;
  storageUrl: string;
  status: DocumentStatus;
  pageCount?: number;
  fileSize?: number;
  subjectTag?: string;
  summary?: ISummary;
  processingError?: string;
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
  },
  {
    timestamps: true,
  },
);

DocumentSchema.index({ ownerId: 1, createdAt: -1 });
DocumentSchema.index({ status: 1 });

export default mongoose.model<IDocument>('Document', DocumentSchema);