import { Response } from 'express';
import { AuthRequest } from '../../common/middleware/auth.js';
import { UsersService } from './users.service.js';
import { updateProfileSchema, changePasswordSchema } from './users.dto.js';

export class UsersController {
  static async getProfile(req: AuthRequest, res: Response) {
    try {
      const user = await UsersService.getProfile(req.user!.userId);
      res.json(user);
    } catch (error: any) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
    }
  }

  static async updateProfile(req: AuthRequest, res: Response) {
    try {
      const validatedData = updateProfileSchema.parse(req.body);
      const user = await UsersService.updateProfile(req.user!.userId, validatedData);
      res.json(user);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
    }
  }

  static async updateAvatar(req: AuthRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'No avatar image uploaded' },
        });
      }

      const result = await UsersService.updateAvatar(req.user!.userId, req.file);
      res.json(result);
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }

      if (error.message === 'Avatar image could not be processed') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to update avatar',
        },
      });
    }
  }

  static async changePassword(req: AuthRequest, res: Response) {
    try {
      const validatedData = changePasswordSchema.parse(req.body);
      const result = await UsersService.changePassword(req.user!.userId, validatedData);
      res.json(result);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
    }
  }
}
