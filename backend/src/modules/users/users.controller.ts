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