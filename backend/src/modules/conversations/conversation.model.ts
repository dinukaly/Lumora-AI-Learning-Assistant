import mongoose, { Document, Schema } from 'mongoose';

export interface IConversation extends Document {
  userId: mongoose.Types.ObjectId;
  documentId?: mongoose.Types.ObjectId;
  title: string;
  contextSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: undefined },
    title: { type: String, required: true, trim: true },
    contextSummary: { type: String, default: undefined, trim: true },
  },
  {
    timestamps: true,
  },
);

ConversationSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model<IConversation>('Conversation', ConversationSchema);
