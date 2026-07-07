import mongoose, { Document, Schema, Types } from 'mongoose';

export type AuthProvider = 'local' | 'google' | 'apple';

export interface IAuthIdentity extends Document {
  userId: Types.ObjectId;
  provider: AuthProvider;
  providerUserId?: string;
  emailAtProvider?: string;
  emailVerifiedAtProvider: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AuthIdentitySchema = new Schema<IAuthIdentity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['local', 'google', 'apple'], required: true },
    providerUserId: { type: String, trim: true },
    emailAtProvider: { type: String, lowercase: true, trim: true },
    emailVerifiedAtProvider: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

AuthIdentitySchema.index(
  { provider: 1, providerUserId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerUserId: { $type: 'string' },
    },
  },
);

AuthIdentitySchema.index(
  { userId: 1, provider: 1 },
  {
    unique: true,
  },
);

export default mongoose.model<IAuthIdentity>('AuthIdentity', AuthIdentitySchema);
