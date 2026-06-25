import mongoose, { Document, Schema } from 'mongoose';

export interface IDocumentChunkMetadata {
  pageNumbers: number[];
  startPageNumber: number;
  endPageNumber: number;
}

export interface IDocumentChunk extends Document {
  documentId: mongoose.Types.ObjectId;
  chunkIndex: number;
  text: string;
  embedding: number[];
  pageNumber?: number;
  tokenCount?: number;
  metadata?: IDocumentChunkMetadata;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentChunkSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    pageNumber: { type: Number },
    tokenCount: { type: Number },
    metadata: {
      type: {
        pageNumbers: { type: [Number], default: undefined },
        startPageNumber: { type: Number, required: true },
        endPageNumber: { type: Number, required: true },
      },
      default: undefined,
    },
  },
  {
    timestamps: true,
  },
);

DocumentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });

export default mongoose.model<IDocumentChunk>('DocumentChunk', DocumentChunkSchema);
