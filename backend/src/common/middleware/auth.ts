import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import User from '../../modules/users/user.model.js';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: 'USER' | 'ADMIN';
    emailVerifiedAt?: string | null;
  };
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'No token provided',
      },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.userId).select('role disabledAt emailVerifiedAt');
    if (!user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found',
        },
      });
    }

    if (user.disabledAt) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Account is disabled',
        },
      });
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    };
    next();
  } catch {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
    });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    });
  }
  next();
};

export const requireVerified = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.emailVerifiedAt) {
    return next();
  }

  return res.status(403).json({
    error: {
      code: 'EMAIL_UNVERIFIED',
      message: 'Verify your email to use this feature.',
    },
  });
};
