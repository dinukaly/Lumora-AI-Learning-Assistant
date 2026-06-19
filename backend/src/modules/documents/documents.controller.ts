import { Response } from 'express';
import { AuthRequest } from '../../common/middleware/auth.js';
import { DocumentsService } from './documents.service.js';

export class DocumentsController {
  static async upload(req: AuthRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
      }

      const title = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, '');
      const userId = req.user!.userId;

      const document = await DocumentsService.createDocumentRecord(userId, title, req.file);

      res.status(201).json({
        message: 'Document uploaded successfully',
        document,
      });
    } catch (error: any) {
      if (error.message === 'Only PDF files are allowed') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async list(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
      const status = req.query.status as string | undefined;

      const validStatuses = ['UPLOADED', 'PROCESSING', 'READY', 'FAILED'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } });
      }

      const result = await DocumentsService.listDocuments(userId, { page, limit, status });

      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const documentId = req.params.id;

      const document = await DocumentsService.getDocumentById(documentId, userId);

      res.status(200).json({ document });
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

  static async remove(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const documentId = req.params.id;

      await DocumentsService.deleteDocument(documentId, userId);

      res.status(200).json({ message: 'Document deleted successfully' });
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
}