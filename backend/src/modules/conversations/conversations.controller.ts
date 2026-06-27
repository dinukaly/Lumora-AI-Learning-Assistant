import { Response } from 'express';
import { AuthRequest } from '../../common/middleware/auth.js';
import { ConversationsService } from './conversations.service.js';

export class ConversationsController {
  static async list(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
      const documentId = req.query.documentId as string | undefined;

      const result = await ConversationsService.listConversations(userId, { page, limit, documentId });

      res.status(200).json(result);
    } catch (error: any) {
      if (error.message === 'Invalid document ID') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      if (error.message === 'Document not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const conversationId = req.params.id;

      const conversation = await ConversationsService.getConversationById(conversationId, userId);

      res.status(200).json(conversation);
    } catch (error: any) {
      if (error.message === 'Invalid conversation ID') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      if (error.message === 'Conversation not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }
}
