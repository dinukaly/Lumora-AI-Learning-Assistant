import mongoose, { Document, Schema } from 'mongoose';

interface ArtifactCitation {
  chunkId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  pageNumber: number;
  snippet: string;
}

interface ArtifactConcept {
  title: string;
  description: string;
}

export type AIActionArtifactType = 'SUMMARY' | 'CONCEPTS';

export interface IAIActionArtifact extends Document {
  userId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  actionType: AIActionArtifactType;
  createdBy: 'AI' | string;
  summary?: string;
  takeaways?: string[];
  concepts?: ArtifactConcept[];
  citations?: ArtifactCitation[];
  sourceChunkIds?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const CitationSchema = new Schema(
  {
    chunkId: { type: Schema.Types.ObjectId, ref: 'DocumentChunk', required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    pageNumber: { type: Number, required: true, min: 0 },
    snippet: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const ConceptSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const AIActionArtifactSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    actionType: {
      type: String,
      enum: ['SUMMARY', 'CONCEPTS'],
      required: true,
      index: true,
    },
    createdBy: { type: String, required: true, trim: true, default: 'AI' },
    summary: { type: String, trim: true, default: undefined },
    takeaways: {
      type: [{ type: String, trim: true }],
      default: undefined,
    },
    concepts: {
      type: [ConceptSchema],
      default: undefined,
    },
    citations: {
      type: [CitationSchema],
      default: undefined,
    },
    sourceChunkIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'DocumentChunk' }],
      default: undefined,
    },
  },
  {
    timestamps: true,
  },
);

AIActionArtifactSchema.index({ userId: 1, documentId: 1, actionType: 1, createdAt: -1 });

export default mongoose.model<IAIActionArtifact>('AIActionArtifact', AIActionArtifactSchema);
