import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import documentRoutes from './modules/documents/documents.routes.js';
import conversationRoutes from './modules/conversations/conversations.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import learningRoutes from './modules/learning/learning.routes.js';

const app: Express = express();

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/learning', learningRoutes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Lumora API is running' });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'File size exceeds the 50MB limit' } });
  }

  if (err.message === 'Only PDF files are allowed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } });
  }

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
});

export default app;
