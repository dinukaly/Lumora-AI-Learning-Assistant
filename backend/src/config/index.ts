import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/lumora',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },

  // Chat Provider — OpenRouter (LLM gateway)
  chat: {
    provider: process.env.CHAT_PROVIDER || 'openrouter',
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-lite-preview-02-05',
    },
  },

  // Embedding Provider — replaceable (google | huggingface | local)
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER || 'google',
    model: process.env.EMBEDDING_MODEL || 'text-embedding-004',
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10),
  },

  // Storage — S3-compatible (MinIO local → Cloudflare R2 prod)
  storage: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
    bucketName: process.env.S3_BUCKET_NAME || 'lumora-documents',
    useSsl: process.env.S3_USE_SSL === 'true',
  },

  // Redis — BullMQ job queue
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  extraction: {
    pythonExecutable: process.env.PYTHON_EXECUTABLE || 'python',
    timeoutMs: parseInt(process.env.PDF_EXTRACTION_TIMEOUT_MS || '120000', 10),
  },
};
