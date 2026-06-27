import { Response } from 'express';
import { AuthRequest } from '../../common/middleware/auth.js';
import { AIChatService } from './ai-chat.service.js';
import { FlashcardJobService } from '../learning/flashcard-job.service.js';

const chatService = new AIChatService();
const VALID_ACTIONS = new Set([
  'CHAT',
  'EXPLAIN_CONCEPT',
  'SUMMARIZE_DOCUMENT',
  'GENERATE_FLASHCARDS',
  'GENERATE_QUIZ',
]);

export class AIController {
  static async chat(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { conversationId, documentId, message, action } = req.body ?? {};

      if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Message is required' } });
      }

      if (action !== undefined && !VALID_ACTIONS.has(action)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid AI action' } });
      }

      const wantsStream = req.query.stream === 'true'
        || req.body?.stream === true
        || req.headers.accept?.includes('text/event-stream');

      const payload = {
        userId,
        conversationId: typeof conversationId === 'string' ? conversationId : undefined,
        documentId: typeof documentId === 'string' ? documentId : undefined,
        message: message.trim(),
        action,
      };

      if (!wantsStream) {
        const responseMessage = await chatService.sendMessage(payload);
        return res.status(200).json({ message: responseMessage });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      for await (const event of chatService.streamMessage(payload)) {
        writeSseEvent(res, event.type, event);
      }

      res.end();
    } catch (error: any) {
      if (req.headers.accept?.includes('text/event-stream') || req.query.stream === 'true') {
        writeSseEvent(res, 'error', {
          message: error.message,
        });
        return res.end();
      }

      if (
        error.message === 'Invalid conversation ID'
        || error.message === 'Invalid document ID'
        || error.message === 'Message is required'
        || error.message === 'A documentId is required for document-grounded chat'
        || error.message === 'Conversation document does not match request document'
      ) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }

      if (error.message === 'Conversation not found' || error.message === 'Document not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }

  static async generateFlashcards(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const { documentId, count, topic } = req.body ?? {};

      if (typeof documentId !== 'string' || !documentId.trim()) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'documentId is required' },
        });
      }

      const normalizedCount = typeof count === 'number'
        ? count
        : typeof count === 'string'
          ? Number.parseInt(count, 10)
          : undefined;

      const job = await FlashcardJobService.queueGeneration({
        userId,
        documentId: documentId.trim(),
        count: normalizedCount,
        topic: typeof topic === 'string' ? topic : undefined,
      });

      return res.status(202).json({
        jobId: job.id,
        message: 'Flashcard generation queued',
      });
    } catch (error: any) {
      if (
        error.message === 'Invalid document ID'
        || error.message === 'Document is not ready for flashcard generation'
      ) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }
      if (error.message === 'Document not found') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
      }

      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: error.message } });
    }
  }
}

function writeSseEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
