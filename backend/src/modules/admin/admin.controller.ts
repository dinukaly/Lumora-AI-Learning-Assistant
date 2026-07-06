import { Response } from 'express';
import { ZodError } from 'zod';
import { AuthRequest } from '../../common/middleware/auth.js';
import {
  getAdminUsageAnalyticsSchema,
  listAdminDocumentsSchema,
  listAdminJobsSchema,
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

  static async listDocuments(req: AuthRequest, res: Response) {
    try {
      const query = listAdminDocumentsSchema.parse(req.query);
      const result = await AdminService.listDocuments(query);
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }

      res.status(400).json({ error: { code: 'BAD_REQUEST', message: getErrorMessage(error) } });
    }
  }

  static async deleteDocument(req: AuthRequest, res: Response) {
    try {
      await AdminService.deleteDocument(req.params.id);
      res.json({ message: 'Document deleted successfully' });
    } catch (error: unknown) {
      if (getErrorMessage(error) === 'Invalid document ID') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: getErrorMessage(error) } });
      }

      if (getErrorMessage(error) === 'Document not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: getErrorMessage(error) } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage(error) } });
    }
  }

  static async listJobs(req: AuthRequest, res: Response) {
    try {
      const query = listAdminJobsSchema.parse(req.query);
      const result = await AdminService.listJobs(query);
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }

      res.status(400).json({ error: { code: 'BAD_REQUEST', message: getErrorMessage(error) } });
    }
  }

  static async retryJob(req: AuthRequest, res: Response) {
    try {
      const job = await AdminService.retryJob(req.params.id);
      res.json(job);
    } catch (error: unknown) {
      const message = getErrorMessage(error);

      if (message === 'Invalid job ID') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
      }

      if (message === 'Job not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message } });
      }

      if (message === 'Only failed jobs can be retried' || message.startsWith('Job payload is missing')) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message } });
    }
  }

  static async getStats(req: AuthRequest, res: Response) {
    try {
      void req;
      const stats = await AdminService.getStats();
      res.json(stats);
    } catch (error: unknown) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage(error) } });
    }
  }

  static async getUsageAnalytics(req: AuthRequest, res: Response) {
    try {
      const query = getAdminUsageAnalyticsSchema.parse(req.query);
      const analytics = await AdminService.getUsageAnalytics(query);
      res.json(analytics);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
      }

      if (
        getErrorMessage(error) === 'Invalid date range'
        || getErrorMessage(error) === '"from" must be less than or equal to "to"'
      ) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: getErrorMessage(error) } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: getErrorMessage(error) } });
    }
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}
