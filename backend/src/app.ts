import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/index.js';
import { getReadinessStatus } from './common/health/readiness.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import documentRoutes from './modules/documents/documents.routes.js';
import conversationRoutes from './modules/conversations/conversations.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import learningRoutes from './modules/learning/learning.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';

const app: Express = express();

// Middleware
app.set('trust proxy', config.trustProxy);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: config.frontendUrl,
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
app.use('/api/v1/notifications', notificationRoutes);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'lumora-api', env: config.env });
});

app.get('/livez', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'lumora-api', env: config.env });
});

app.get('/readyz', async (req: Request, res: Response) => {
  const readiness = await getReadinessStatus();

  res.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? 'ready' : 'not_ready',
    service: 'lumora-api',
    env: config.env,
    checks: readiness.checks,
  });
});

// Error handling middleware
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  void _next;
  console.error(err);

  if (hasCode(err, 'LIMIT_FILE_SIZE')) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'File size exceeds the 50MB limit' } });
  }

  if (hasMessage(err, 'Only PDF files are allowed')) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message } });
  }

  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
});

export default app;

function hasCode(error: unknown, code: string): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function hasMessage(error: unknown, message: string): error is { message: string } {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && error.message === message;
}
