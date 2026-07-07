import crypto from 'crypto';
import multer, { FileFilterCallback } from 'multer';
import sharp from 'sharp';
import { config } from '../../config/index.js';
import { S3CompatibleStorageProvider } from '../../common/storage/index.js';
import type { StorageProvider } from '../../common/storage/index.js';
import User from './user.model.js';
import { UpdateProfileDTO, ChangePasswordDTO } from './users.dto.js';

const AVATAR_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_OUTPUT_CONTENT_TYPE = 'image/webp';
const defaultStorageProvider: StorageProvider = new S3CompatibleStorageProvider(config.avatar.storage);
const avatarStorage = multer.memoryStorage();

const avatarFileFilter = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (AVATAR_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Avatar must be a JPEG, PNG, or WebP image'));
  }
};

export const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: { fileSize: config.avatar.maxUploadBytes },
});

export function getAvatarUploadErrorMessage(error: unknown) {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return `Avatar image must be ${formatBytes(config.avatar.maxUploadBytes)} or smaller`;
  }

  if (error instanceof Error) {
    return error.message || 'Avatar upload failed';
  }

  return 'Avatar upload failed';
}

export class UsersService {
  private static storageProvider: StorageProvider = defaultStorageProvider;

  static setStorageProviderForTesting(provider: StorageProvider) {
    this.storageProvider = provider;
  }

  static resetStorageProviderForTesting() {
    this.storageProvider = defaultStorageProvider;
  }

  static async getProfile(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return serializeUserProfile(user);
  }

  static async updateProfile(userId: string, data: UpdateProfileDTO) {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!user) {
      throw new Error('User not found');
    }
    return serializeUserProfile(user);
  }

  static async updateAvatar(userId: string, file: Express.Multer.File) {
    const existingUser = await User.findById(userId);
    if (!existingUser) {
      throw new Error('User not found');
    }

    const processedAvatar = await processAvatar(file.buffer);
    const storageKey = `avatars/${userId}/${crypto.randomUUID()}.webp`;
    const storageUrl = await this.storageProvider.upload(
      storageKey,
      processedAvatar,
      AVATAR_OUTPUT_CONTENT_TYPE,
    );
    const avatarUrl = buildAvatarUrl(storageUrl, storageKey);
    const previousStorageKey = existingUser.avatarStorageKey;

    existingUser.avatar = avatarUrl;
    existingUser.avatarStorageKey = storageKey;
    await existingUser.save();

    if (previousStorageKey && previousStorageKey !== storageKey) {
      void this.storageProvider.delete(previousStorageKey).catch((error) => {
        console.warn(`Failed to delete previous avatar "${previousStorageKey}"`, error);
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return {
      user: serializeUserProfile(user),
      avatar: { url: avatarUrl },
      message: 'Avatar updated successfully',
    };
  }

  static async changePassword(userId: string, data: ChangePasswordDTO) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const isMatch = await user.comparePassword(data.currentPassword);
    if (!isMatch) {
      throw new Error('Current password is incorrect');
    }

    user.passwordHash = data.newPassword;
    user.lastPasswordChangedAt = new Date();
    await user.save();

    return { message: 'Password updated successfully' };
  }
}

async function processAvatar(input: Buffer) {
  try {
    return await sharp(input, { failOn: 'error' })
      .rotate()
      .resize(config.avatar.outputSizePx, config.avatar.outputSizePx, {
        fit: 'cover',
        position: 'centre',
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new Error('Avatar image could not be processed');
  }
}

function buildAvatarUrl(storageUrl: string, storageKey: string) {
  const baseUrl = config.avatar.publicBaseUrl.trim();
  if (!baseUrl) {
    return storageUrl;
  }

  const encodedKey = storageKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }

  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
}

function serializeUserProfile(user: InstanceType<typeof User>) {
  const userObject = user.toObject();
  const { passwordHash, ...safeUser } = userObject as typeof userObject & { passwordHash?: string };
  const authProviders = Array.isArray(user.authProviderSummary) && user.authProviderSummary.length > 0
    ? [...new Set(user.authProviderSummary)]
    : passwordHash
      ? ['local']
      : [];

  return {
    ...safeUser,
    authProviders,
    hasPassword: Boolean(passwordHash),
  };
}
