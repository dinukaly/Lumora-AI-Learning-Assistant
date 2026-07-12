import { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { loginSchema, refreshSchema, registerSchema, verifyEmailQuerySchema } from './auth.dto.js';
import { config } from '../../config/index.js';
import { AuthRequest } from '../../common/middleware/auth.js';
import { EmailVerificationError, EmailVerificationService } from './email-verification.service.js';
import { GoogleOAuthError, GoogleOAuthService } from './google-oauth.service.js';
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
  static async startGoogleOAuth(_req: Request, res: Response) {
    try {
      const { authorizationUrl, cookieValue } = GoogleOAuthService.createAuthorizationUrl();
      GoogleOAuthService.applyOauthCookie(res, cookieValue);
      res.redirect(302, authorizationUrl);
    } catch (error: unknown) {
      if (error instanceof GoogleOAuthError) {
        return sendGoogleOauthErrorResponse(reqAcceptsJson(_req), res, error);
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage(error) } });
    }
  }

  static async register(req: Request, res: Response) {
    try {
      const validatedData = registerSchema.parse(req.body);
      const { refreshToken, result, verificationEmailSent } = await registerWithVerification(req, validatedData);
      
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
      const { refreshToken, ...result } = await AuthService.login(validatedData, getRequestContext(req));
      
      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
      res.status(200).json(result);
    } catch (error: unknown) {
      return sendLoginErrorResponse(res, error);
    }
  }

  static async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        throw new Error('No refresh token provided');
      }
      
      const { refreshToken: newRefreshToken, ...result } = await AuthService.refresh(refreshToken, getRequestContext(req));
      
      res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);
      res.status(200).json(result);
    } catch (error: unknown) {
      return sendRefreshErrorResponse(res, error);
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

  static async mobileRegister(req: Request, res: Response) {
    try {
      const validatedData = registerSchema.parse(req.body);
      const { refreshToken, result, verificationEmailSent } = await registerWithVerification(req, validatedData);

      res.status(201).json({
        ...result,
        refreshToken,
        emailVerificationRequired: true,
        verificationEmailSent,
        message: 'Account created. Verify your email to unlock all features.',
      });
    } catch (error: unknown) {
      if (isZodError(error)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: getErrorMessage(error) } });
    }
  }

  static async mobileLogin(req: Request, res: Response) {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await AuthService.login(validatedData, getRequestContext(req));
      res.status(200).json(result);
    } catch (error: unknown) {
      return sendLoginErrorResponse(res, error);
    }
  }

  static async mobileRefresh(req: Request, res: Response) {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      const result = await AuthService.refresh(refreshToken, getRequestContext(req));
      res.status(200).json(result);
    } catch (error: unknown) {
      if (isZodError(error)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }
      return sendRefreshErrorResponse(res, error);
    }
  }

  static async mobileLogout(req: Request, res: Response) {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      await AuthService.logout(refreshToken);
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error: unknown) {
      if (isZodError(error)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }
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

  static async googleOAuthCallback(req: Request, res: Response) {
    const wantsJson = reqAcceptsJson(req);
    const providerError = typeof req.query.error === 'string' ? req.query.error : '';
    const providerErrorDescription =
      typeof req.query.error_description === 'string' ? req.query.error_description : '';

    if (providerError) {
      GoogleOAuthService.clearOauthCookie(res);
      return sendGoogleOauthErrorResponse(
        wantsJson,
        res,
        new GoogleOAuthError(
          'OAUTH_PROVIDER_ERROR',
          'Google sign-in could not be completed. Please try again.',
          400,
        ),
        providerError,
        providerErrorDescription,
      );
    }

    try {
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!code || !state) {
        throw new GoogleOAuthError(
          'OAUTH_INVALID_STATE',
          'Google sign-in could not be completed safely. Please try again.',
          400,
        );
      }

      const { refreshToken, ...result } = await GoogleOAuthService.completeAuthorization({
        code,
        cookieValue: req.cookies.googleOAuthState,
        state,
        context: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      });

      GoogleOAuthService.clearOauthCookie(res);
      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

      if (wantsJson) {
        return res.status(200).json(result);
      }

      const successUrl = new URL(config.oauth.google.frontendCallbackUrl);
      successUrl.searchParams.set('provider', 'google');
      successUrl.searchParams.set('status', 'success');
      res.redirect(302, successUrl.toString());
    } catch (error: unknown) {
      GoogleOAuthService.clearOauthCookie(res);
      if (error instanceof GoogleOAuthError) {
        return sendGoogleOauthErrorResponse(wantsJson, res, error);
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

function getRequestContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  };
}

async function registerWithVerification(req: Request, validatedData: ReturnType<typeof registerSchema.parse>) {
  const { refreshToken, ...result } = await AuthService.register(validatedData, getRequestContext(req));

  let verificationEmailSent = false;
  try {
    const verificationResult = await EmailVerificationService.sendVerificationEmailForUser(
      result.user.id,
    );
    verificationEmailSent = verificationResult.sent;
  } catch (verificationError) {
    console.error('Failed to send verification email after signup', verificationError);
  }

  return { refreshToken, result, verificationEmailSent };
}

function sendLoginErrorResponse(res: Response, error: unknown) {
  if (isZodError(error)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
  }
  if (error instanceof LoginProtectionError) {
    return sendRateLimitedResponse(res, error);
  }
  if (getErrorMessage(error) === 'Account is disabled') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: getErrorMessage(error) } });
  }
  return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) } });
}

function sendRefreshErrorResponse(res: Response, error: unknown) {
  if (getErrorMessage(error) === 'Account is disabled') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: getErrorMessage(error) } });
  }

  return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: getErrorMessage(error) } });
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

function reqAcceptsJson(req: Request) {
  const acceptHeader = req.get('accept') || '';
  return acceptHeader.includes('application/json');
}

function sendGoogleOauthErrorResponse(
  wantsJson: boolean,
  res: Response,
  error: GoogleOAuthError,
  providerError?: string,
  providerErrorDescription?: string,
) {
  if (wantsJson) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        providerError,
        providerErrorDescription,
      },
    });
  }

  const errorUrl = new URL(config.oauth.google.frontendCallbackUrl);
  errorUrl.searchParams.set('provider', 'google');
  errorUrl.searchParams.set('status', 'error');
  errorUrl.searchParams.set('code', error.code);
  res.redirect(302, errorUrl.toString());
}
