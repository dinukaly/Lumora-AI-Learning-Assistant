import mongoose, { Document, Schema } from 'mongoose';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface IMessageCitation {
  chunkId?: mongoose.Types.ObjectId;
  documentId?: mongoose.Types.ObjectId;
  pageNumber?: number;
  snippet?: string;
}

export interface IMessageTokenUsage {
  prompt?: number;
  completion?: number;
  total?: number;
}

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  role: MessageRole;
  content: string;
  citations?: IMessageCitation[];
  tokenUsage?: IMessageTokenUsage;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: { type: String, required: true, trim: true },
    citations: {
      type: [
        {
          _id: false,
          chunkId: { type: Schema.Types.ObjectId, ref: 'DocumentChunk', default: undefined },
          documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: undefined },
          pageNumber: { type: Number, default: undefined },
          snippet: { type: String, default: undefined, trim: true },
        },
      ],
      default: undefined,
    },
    tokenUsage: {
      type: {
        prompt: { type: Number, default: undefined },
        completion: { type: Number, default: undefined },
        total: { type: Number, default: undefined },
      },
      _id: false,
      default: undefined,
    },
  },
  {
    timestamps: true,
  },
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

export default mongoose.model<IMessage>('Message', MessageSchema);
