import { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { registerSchema, loginSchema, refreshSchema } from './auth.dto.js';

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const validatedData = registerSchema.parse(req.body);
      const result = await AuthService.register(validatedData);
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
      const result = await AuthService.login(validatedData);
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
      const validatedData = refreshSchema.parse(req.body);
      const result = await AuthService.refresh(validatedData.refreshToken);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: error.message } });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      const result = await AuthService.logout();
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }
}
