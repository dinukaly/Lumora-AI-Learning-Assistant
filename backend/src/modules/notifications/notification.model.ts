import mongoose, { Document, Schema } from 'mongoose';

export type NotificationType =
  | 'DOCUMENT_READY'
  | 'PROCESSING_FAILED'
  | 'FLASHCARDS_READY'
  | 'QUIZ_READY'
  | 'SYSTEM'
  | 'ADMIN_BROADCAST';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['DOCUMENT_READY', 'PROCESSING_FAILED', 'FLASHCARDS_READY', 'QUIZ_READY', 'SYSTEM', 'ADMIN_BROADCAST'],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    metadata: { type: Schema.Types.Mixed, default: undefined },
    readAt: { type: Date, default: undefined },
  },
  {
    timestamps: true,
  },
);

NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
