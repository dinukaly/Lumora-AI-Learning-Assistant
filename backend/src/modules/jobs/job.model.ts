import mongoose, { Schema, Document } from 'mongoose';

export type JobType =
  | 'TEXT_EXTRACTION'
  | 'CHUNKING_EMBEDDING'
  | 'SUMMARY_GENERATION'
  | 'FLASHCARD_GENERATION'
  | 'QUIZ_GENERATION';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'RETRYING';

export interface IJob extends Document {
  type: JobType;
  status: JobStatus;
  progress: number;
  documentId?: mongoose.Types.ObjectId;
  error?: string;
  attempts: number;
  bullJobId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema: Schema = new Schema(
  {
    type: { 
      type: String, 
      enum: ['TEXT_EXTRACTION', 'CHUNKING_EMBEDDING', 'SUMMARY_GENERATION', 'FLASHCARD_GENERATION', 'QUIZ_GENERATION'], 
      required: true 
    },
    status: { 
      type: String, 
      enum: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'RETRYING'], 
      default: 'QUEUED', 
      required: true 
    },
    progress: { type: Number, default: 0 },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document' },
    error: { type: String },
    attempts: { type: Number, default: 0 },
    bullJobId: { type: String },
  },
  {
    timestamps: true,
  }
);

JobSchema.index({ status: 1 });
JobSchema.index({ documentId: 1 });

export default mongoose.model<IJob>('Job', JobSchema);
