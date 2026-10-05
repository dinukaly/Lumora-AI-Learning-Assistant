import mongoose, { Document, Schema, Types } from 'mongoose';

export type EmailVerificationPurpose = 'EMAIL_VERIFY';

export interface IEmailVerificationToken extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  email: string;
  purpose: EmailVerificationPurpose;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdAt: Date;
}

const EmailVerificationTokenSchema = new Schema<IEmailVerificationToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ['EMAIL_VERIFY'], default: 'EMAIL_VERIFY', required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

EmailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
EmailVerificationTokenSchema.index({ userId: 1, purpose: 1, consumedAt: 1 });

export default mongoose.model<IEmailVerificationToken>(
  'EmailVerificationToken',
  EmailVerificationTokenSchema,
);
