import { rateLimit } from 'express-rate-limit';
import { config } from '../../config/index.js';

export const authRateLimit = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  limit: config.rateLimit.authMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication requests. Please try again later.',
      },
    });
  },
});
