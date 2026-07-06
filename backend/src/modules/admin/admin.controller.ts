import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '../../common/middleware/auth.js';
import {
  listAdminUsersSchema,
  setAdminUserDisabledSchema,
  updateAdminUserRoleSchema,
} from './admin.dto.js';
import { AdminService } from './admin.service.js';

export class AdminController {
  static async listUsers(req: AuthRequest, res: Response) {
    try {
      const query = listAdminUsersSchema.parse(req.query);
      const result = await AdminService.listUsers(query);
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }

      res.status(400).json({ error: { code: 'BAD_REQUEST', message: getErrorMessage(error) } });
    }
  }

  static async updateUserRole(req: AuthRequest, res: Response) {
    try {
      const data = updateAdminUserRoleSchema.parse(req.body);
      const user = await AdminService.updateUserRole(req.user!.userId, req.params.id, data);
      res.json(user);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }

      if (getErrorMessage(error) === 'User not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: getErrorMessage(error) } });
      }

      res.status(400).json({ error: { code: 'BAD_REQUEST', message: getErrorMessage(error) } });
    }
  }

  static async setUserDisabled(req: AuthRequest, res: Response) {
    try {
      const data = setAdminUserDisabledSchema.parse(req.body ?? {});
      const user = await AdminService.setUserDisabled(req.user!.userId, req.params.id, data);
      res.json(user);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }

      if (getErrorMessage(error) === 'User not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: getErrorMessage(error) } });
      }

      res.status(400).json({ error: { code: 'BAD_REQUEST', message: getErrorMessage(error) } });
    }
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
