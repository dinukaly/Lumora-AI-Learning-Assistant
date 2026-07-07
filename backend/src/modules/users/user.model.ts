import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash?: string;
  role: 'USER' | 'ADMIN';
  avatar?: string;
  avatarStorageKey?: string;
  emailVerifiedAt?: Date | null;
  authProviderSummary: Array<'local' | 'google' | 'apple'>;
  preferences?: Record<string, unknown>;
  lastLoginAt?: Date;
  failedLoginCount: number;
  lastFailedLoginAt?: Date | null;
  lockedUntil?: Date | null;
  lastPasswordChangedAt?: Date | null;
  disabledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(password: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: false },
    role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER', required: true },
    avatar: { type: String },
    avatarStorageKey: { type: String },
    emailVerifiedAt: { type: Date, default: null },
    authProviderSummary: {
      type: [{ type: String, enum: ['local', 'google', 'apple'] }],
      default: ['local'],
    },
    preferences: { type: Object, default: {} },
    lastLoginAt: { type: Date },
    failedLoginCount: { type: Number, default: 0 },
    lastFailedLoginAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    lastPasswordChangedAt: { type: Date, default: null },
    disabledAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  if (!this.passwordHash) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  if (!this.passwordHash) {
    return false;
  }

  return bcrypt.compare(password, this.passwordHash);
};

export default mongoose.model<IUser>('User', UserSchema);
