import { Response } from 'express';
import { AuthRequest } from '../../common/middleware/auth.js';
import { NotificationsService } from './notifications.service.js';

export class NotificationsController {
  static async list(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const unreadOnly = (req.query.unreadOnly as string | undefined) === 'true';
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const result = await NotificationsService.listNotifications(userId, {
        unreadOnly,
        page,
        limit,
      });

      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async markRead(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const notificationId = req.params.id;
      const result = await NotificationsService.markAsRead(userId, notificationId);
      res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Invalid notification ID') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      if (error.message === 'Notification not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async markAllRead(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const result = await NotificationsService.markAllAsRead(userId);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }
}
