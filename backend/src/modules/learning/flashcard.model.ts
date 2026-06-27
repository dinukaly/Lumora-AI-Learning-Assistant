import mongoose, { Document, Schema } from 'mongoose';

export type FlashcardDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface IFlashcard extends Document {
  documentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sourceChunkId?: mongoose.Types.ObjectId;
  front: string;
  back: string;
  difficulty: FlashcardDifficulty;
  nextReviewAt: Date;
  reviewCount: number;
  successCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const FlashcardSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sourceChunkId: { type: Schema.Types.ObjectId, ref: 'DocumentChunk', default: undefined },
    front: { type: String, required: true, trim: true },
    back: { type: String, required: true, trim: true },
    difficulty: {
      type: String,
      enum: ['EASY', 'MEDIUM', 'HARD'],
      default: 'MEDIUM',
      required: true,
    },
    nextReviewAt: { type: Date, required: true },
    reviewCount: { type: Number, default: 0, min: 0 },
    successCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
  },
);

FlashcardSchema.index({ userId: 1, nextReviewAt: 1 });
FlashcardSchema.index({ documentId: 1 });

export default mongoose.model<IFlashcard>('Flashcard', FlashcardSchema);
