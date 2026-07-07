import { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { loginSchema, registerSchema, verifyEmailQuerySchema } from './auth.dto.js';
import { config } from '../../config/index.js';
import { AuthRequest } from '../../common/middleware/auth.js';
import { EmailVerificationError, EmailVerificationService } from './email-verification.service.js';
import { LoginProtectionError } from './login-protection.service.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'strict' as const,
};

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const validatedData = registerSchema.parse(req.body);
      const { refreshToken, ...result } = await AuthService.register(validatedData, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      let verificationEmailSent = false;
      try {
        const verificationResult = await EmailVerificationService.sendVerificationEmailForUser(
          result.user.id,
        );
        verificationEmailSent = verificationResult.sent;
      } catch (verificationError) {
        console.error('Failed to send verification email after signup', verificationError);
      }
      
      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
      res.status(201).json({
        ...result,
        emailVerificationRequired: true,
        verificationEmailSent,
        message: 'Account created. Verify your email to unlock protected features.',
      });
    } catch (error: unknown) {
      if (isZodError(error)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: getErrorMessage(error) } });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const validatedData = loginSchema.parse(req.body);
      const { refreshToken, ...result } = await AuthService.login(validatedData, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      
      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
      res.status(200).json(result);
    } catch (error: unknown) {
      if (isZodError(error)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }
      if (error instanceof LoginProtectionError) {
        return sendRateLimitedResponse(res, error);
      }
      if (getErrorMessage(error) === 'Account is disabled') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: getErrorMessage(error) } });
      }
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) } });
    }
  }

  static async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        throw new Error('No refresh token provided');
      }
      
      const { refreshToken: newRefreshToken, ...result } = await AuthService.refresh(refreshToken, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      
      res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);
      res.status(200).json(result);
    } catch (error: unknown) {
      if (getErrorMessage(error) === 'Account is disabled') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: getErrorMessage(error) } });
      }
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) } });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      await AuthService.logout(req.cookies.refreshToken);
      res.clearCookie('refreshToken', CLEAR_COOKIE_OPTIONS);
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error: unknown) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage(error) } });
    }
  }

  static async resendVerificationEmail(req: AuthRequest, res: Response) {
    try {
      await EmailVerificationService.sendVerificationEmailForUser(req.user!.userId);
      res.status(200).json({
        message: 'If verification is still required, a new email has been sent.',
      });
    } catch (error: unknown) {
      if (error instanceof EmailVerificationError && error.code === 'NOT_FOUND') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage(error) } });
    }
  }

  static async verifyEmail(req: Request, res: Response) {
    try {
      const { token } = verifyEmailQuerySchema.parse(req.query);
      const result = await EmailVerificationService.verifyEmailToken(token);
      res.status(200).json(result);
    } catch (error: unknown) {
      if (isZodError(error)) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            details: error.errors,
          },
        });
      }

      if (error instanceof EmailVerificationError) {
        const errorCode = error.code === 'TOKEN_EXPIRED' ? 'TOKEN_EXPIRED' : error.code;
        return res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({
          error: {
            code: errorCode,
            message: error.message,
          },
        });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage(error) } });
    }
  }
}

function isZodError(error: unknown): error is { name: 'ZodError'; errors: unknown[] } {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'ZodError'
    && 'errors' in error;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unexpected error';
}

function sendRateLimitedResponse(res: Response, error: LoginProtectionError) {
  if (error.retryAfterSeconds) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }

  return res.status(429).json({
    error: {
      code: error.code,
      message: error.message,
    },
  });
}
