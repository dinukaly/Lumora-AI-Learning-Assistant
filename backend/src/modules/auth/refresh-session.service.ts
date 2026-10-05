import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import type { Types } from 'mongoose';
import RefreshSession, { IRefreshSession } from './refresh-session.model.js';

export type RefreshSessionReason =
  | 'ACCOUNT_DISABLED'
  | 'LOGOUT'
  | 'REUSED'
  | 'ROTATED';

export interface RefreshSessionContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface CreateRefreshSessionInput extends RefreshSessionContext {
  familyId?: string;
  refreshToken: string;
  userId: string | Types.ObjectId;
}

export class RefreshSessionService {
  static async createSession(input: CreateRefreshSessionInput) {
    const expiresAt = getRefreshTokenExpirationDate(input.refreshToken);

    return RefreshSession.create({
      userId: input.userId,
      tokenHash: hashRefreshToken(input.refreshToken),
      familyId: input.familyId ?? crypto.randomUUID(),
      expiresAt,
      ipHash: hashIpAddress(input.ipAddress),
      userAgent: sanitizeUserAgent(input.userAgent),
    });
  }

  static async findSessionByToken(refreshToken: string) {
    return RefreshSession.findOne({ tokenHash: hashRefreshToken(refreshToken) });
  }

  static async revokeSession(
    sessionId: string | Types.ObjectId,
    reason: RefreshSessionReason,
    options?: { replacedBySessionId?: string | Types.ObjectId | null },
  ) {
    await RefreshSession.updateOne(
      { _id: sessionId, revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: reason,
          replacedBySessionId: options?.replacedBySessionId ?? null,
          lastUsedAt: new Date(),
        },
      },
    );
  }

  static async revokeSessionByToken(refreshToken: string, reason: RefreshSessionReason) {
    const session = await this.findSessionByToken(refreshToken);
    if (!session || session.revokedAt) {
      return;
    }

    await this.revokeSession(session._id, reason);
  }

  static async revokeFamily(familyId: string, reason: RefreshSessionReason) {
    await RefreshSession.updateMany(
      { familyId, revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: reason,
          lastUsedAt: new Date(),
        },
      },
    );
  }

  static async revokeUserSessions(userId: string | Types.ObjectId, reason: RefreshSessionReason) {
    await RefreshSession.updateMany(
      { userId, revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: reason,
          lastUsedAt: new Date(),
        },
      },
    );
  }
}

export function hashRefreshToken(refreshToken: string) {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

export function isRefreshSessionRevoked(session: IRefreshSession) {
  return Boolean(session.revokedAt);
}

export function getRefreshTokenExpirationDate(refreshToken: string) {
  const decoded = jwt.decode(refreshToken);
  const exp = isJwtPayload(decoded) ? decoded.exp : undefined;

  if (typeof exp !== 'number') {
    throw new Error('Refresh token is missing an expiration');
  }

  return new Date(exp * 1000);
}

function hashIpAddress(ipAddress?: string | null) {
  if (!ipAddress) {
    return null;
  }

  return crypto.createHash('sha256').update(ipAddress).digest('hex');
}

function sanitizeUserAgent(userAgent?: string | null) {
  if (!userAgent) {
    return null;
  }

  return userAgent.slice(0, 512);
}

function isJwtPayload(value: string | JwtPayload | null): value is JwtPayload {
  return typeof value === 'object' && value !== null;
}
