import { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { registerSchema, loginSchema } from './auth.dto.js';
import { config } from '../../config/index.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const validatedData = registerSchema.parse(req.body);
      const { refreshToken, ...result } = await AuthService.register(validatedData);
      
      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
      res.status(201).json(result);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const validatedData = loginSchema.parse(req.body);
      const { refreshToken, ...result } = await AuthService.login(validatedData);
      
      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);
      res.status(200).json(result);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: error.message } });
    }
  }

  static async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        throw new Error('No refresh token provided');
      }
      
      const { refreshToken: newRefreshToken, ...result } = await AuthService.refresh(refreshToken);
      
      res.cookie('refreshToken', newRefreshToken, COOKIE_OPTIONS);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: error.message } });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      await AuthService.logout();
      res.clearCookie('refreshToken', COOKIE_OPTIONS);
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error: any) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }
}
