import mongoose, { Document, Schema } from 'mongoose';

export type UsageActionType =
  | 'CHAT'
  | 'EXPLAIN_CONCEPT'
  | 'SUMMARIZE_DOCUMENT'
  | 'GENERATE_FLASHCARDS'
  | 'GENERATE_QUIZ'
  | 'PROCESSING';

export interface IUsageEvent extends Document {
  userId: mongoose.Types.ObjectId;
  actionType: UsageActionType;
  tokensUsed: number;
  documentId?: mongoose.Types.ObjectId;
  costEstimate?: number;
  createdAt: Date;
  updatedAt: Date;
}

const UsageEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actionType: {
      type: String,
      enum: ['CHAT', 'EXPLAIN_CONCEPT', 'SUMMARIZE_DOCUMENT', 'GENERATE_FLASHCARDS', 'GENERATE_QUIZ', 'PROCESSING'],
      required: true,
    },
    tokensUsed: { type: Number, required: true, min: 0 },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: undefined },
    costEstimate: { type: Number, default: undefined, min: 0 },
  },
  {
    timestamps: true,
  },
);

UsageEventSchema.index({ userId: 1, createdAt: -1 });
UsageEventSchema.index({ actionType: 1, createdAt: -1 });

export default mongoose.model<IUsageEvent>('UsageEvent', UsageEventSchema);
