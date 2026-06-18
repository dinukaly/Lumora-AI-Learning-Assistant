import mongoose, { Schema, Document } from 'mongoose';

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export interface IDocument extends Document {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  originalFileName: string;
  storageUrl: string;
  status: DocumentStatus;
  pageCount?: number;
  fileSize?: number;
  subjectTag?: string;
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
    processingError: { type: String },
  },
  {
    timestamps: true,
  },
);

DocumentSchema.index({ ownerId: 1, createdAt: -1 });
DocumentSchema.index({ status: 1 });

export default mongoose.model<IDocument>('Document', DocumentSchema);