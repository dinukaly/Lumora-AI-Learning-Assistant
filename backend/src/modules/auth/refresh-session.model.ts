import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IRefreshSession extends Document {
  userId: Types.ObjectId;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  replacedBySessionId?: Types.ObjectId | null;
  lastUsedAt?: Date | null;
  ipHash?: string | null;
  userAgent?: string | null;
  createdAt: Date;
}

const RefreshSessionSchema = new Schema<IRefreshSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, trim: true },
    familyId: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null, trim: true },
    replacedBySessionId: { type: Schema.Types.ObjectId, ref: 'RefreshSession', default: null },
    lastUsedAt: { type: Date, default: null },
    ipHash: { type: String, default: null, trim: true },
    userAgent: { type: String, default: null, trim: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

RefreshSessionSchema.index({ userId: 1, expiresAt: 1 });
RefreshSessionSchema.index({ familyId: 1 });
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IRefreshSession>('RefreshSession', RefreshSessionSchema);
