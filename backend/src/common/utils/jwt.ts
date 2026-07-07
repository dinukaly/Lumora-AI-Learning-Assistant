import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { config } from '../../config/index.js';

export interface TokenPayload {
  userId: string;
  role: 'USER' | 'ADMIN';
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiration as any,
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiration as any,
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
};

export const decodeRefreshToken = (token: string): JwtPayload | null => {
  const decoded = jwt.decode(token);

  if (typeof decoded === 'object' && decoded !== null) {
    return decoded;
  }

  return null;
};
