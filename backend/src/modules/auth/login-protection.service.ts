import crypto from 'crypto';
import { config } from '../../config/index.js';
import type { IUser } from '../users/user.model.js';

type UnknownLoginThrottleBucket = {
  failedCount: number;
  lastFailedAtMs: number;
  lockedUntilMs: number | null;
  lastTouchedAtMs: number;
};

const UNKNOWN_LOGIN_BUCKETS = new Map<string, UnknownLoginThrottleBucket>();
const TOO_MANY_ATTEMPTS_MESSAGE = 'Too many attempts. Please wait and try again.';

export class LoginProtectionError extends Error {
  constructor(
    readonly code: 'RATE_LIMITED',
    readonly retryAfterSeconds?: number,
  ) {
    super(TOO_MANY_ATTEMPTS_MESSAGE);
    this.name = 'LoginProtectionError';
  }
}

export class LoginProtectionService {
  static async assertLoginAllowed(input: {
    email: string;
    user: IUser | null;
    ipAddress?: string;
  }) {
    const nowMs = Date.now();

    if (input.user) {
      await this.resetExpiredAccountProtection(input.user, nowMs);

      if (input.user.lockedUntil && input.user.lockedUntil.getTime() > nowMs) {
        throw new LoginProtectionError(
          'RATE_LIMITED',
          getRetryAfterSeconds(input.user.lockedUntil.getTime(), nowMs),
        );
      }

      return;
    }

    pruneUnknownBuckets(nowMs);

    const bucket = UNKNOWN_LOGIN_BUCKETS.get(buildUnknownBucketKey(input.email, input.ipAddress));
    if (bucket?.lockedUntilMs && bucket.lockedUntilMs > nowMs) {
      throw new LoginProtectionError(
        'RATE_LIMITED',
        getRetryAfterSeconds(bucket.lockedUntilMs, nowMs),
      );
    }
  }

  static async recordFailedAttempt(input: {
    email: string;
    user: IUser | null;
    ipAddress?: string;
  }) {
    const nowMs = Date.now();

    if (input.user) {
      const windowMs = config.rateLimit.loginProtectionWindowMs;
      const lastFailedAtMs = input.user.lastFailedLoginAt?.getTime() ?? 0;
      const shouldResetWindow = !lastFailedAtMs || nowMs - lastFailedAtMs > windowMs;
      const nextFailedCount = shouldResetWindow ? 1 : input.user.failedLoginCount + 1;
      const lockThresholdReached = nextFailedCount >= config.rateLimit.loginProtectionMaxAttempts;

      input.user.failedLoginCount = nextFailedCount;
      input.user.lastFailedLoginAt = new Date(nowMs);
      input.user.lockedUntil = lockThresholdReached
        ? new Date(nowMs + config.rateLimit.loginProtectionLockoutMs)
        : null;
      await input.user.save();

      if (lockThresholdReached) {
        throw new LoginProtectionError(
          'RATE_LIMITED',
          getRetryAfterSeconds(input.user.lockedUntil!.getTime(), nowMs),
        );
      }

      return;
    }

    const bucketKey = buildUnknownBucketKey(input.email, input.ipAddress);
    pruneUnknownBuckets(nowMs);

    const existingBucket = UNKNOWN_LOGIN_BUCKETS.get(bucketKey);
    const shouldResetWindow = !existingBucket || nowMs - existingBucket.lastFailedAtMs > config.rateLimit.loginProtectionWindowMs;
    const nextFailedCount = shouldResetWindow ? 1 : existingBucket.failedCount + 1;
    const lockThresholdReached = nextFailedCount >= config.rateLimit.loginProtectionMaxAttempts;
    const lockedUntilMs = lockThresholdReached
      ? nowMs + config.rateLimit.loginProtectionLockoutMs
      : null;

    UNKNOWN_LOGIN_BUCKETS.set(bucketKey, {
      failedCount: nextFailedCount,
      lastFailedAtMs: nowMs,
      lockedUntilMs,
      lastTouchedAtMs: nowMs,
    });

    if (lockThresholdReached) {
      throw new LoginProtectionError(
        'RATE_LIMITED',
        getRetryAfterSeconds(lockedUntilMs!, nowMs),
      );
    }
  }

  static async resetSuccessfulLogin(user: IUser) {
    user.failedLoginCount = 0;
    user.lastFailedLoginAt = null;
    user.lockedUntil = null;
  }

  private static async resetExpiredAccountProtection(user: IUser, nowMs: number) {
    const windowExpired = user.lastFailedLoginAt
      ? nowMs - user.lastFailedLoginAt.getTime() > config.rateLimit.loginProtectionWindowMs
      : false;
    const lockExpired = user.lockedUntil ? user.lockedUntil.getTime() <= nowMs : false;

    if (!windowExpired && !lockExpired) {
      return;
    }

    user.failedLoginCount = 0;
    user.lastFailedLoginAt = null;
    user.lockedUntil = null;
    await user.save();
  }
}

function buildUnknownBucketKey(email: string, ipAddress?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const ipHash = crypto
    .createHash('sha256')
    .update(ipAddress?.trim() || 'unknown-ip')
    .digest('hex');

  return `${normalizedEmail}:${ipHash}`;
}

function pruneUnknownBuckets(nowMs: number) {
  const staleCutoffMs = Math.max(
    config.rateLimit.loginProtectionWindowMs,
    config.rateLimit.loginProtectionLockoutMs,
  ) * 2;

  for (const [bucketKey, bucket] of UNKNOWN_LOGIN_BUCKETS.entries()) {
    const lockExpired = !bucket.lockedUntilMs || bucket.lockedUntilMs <= nowMs;
    const staleBucket = nowMs - bucket.lastTouchedAtMs > staleCutoffMs;

    if (lockExpired && staleBucket) {
      UNKNOWN_LOGIN_BUCKETS.delete(bucketKey);
    }
  }
}

function getRetryAfterSeconds(targetTimeMs: number, nowMs: number) {
  return Math.max(1, Math.ceil((targetTimeMs - nowMs) / 1000));
}
