import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const embeddingProvider = process.env.EMBEDDING_PROVIDER || 'local';
const defaultEmbeddingModel = process.env.EMBEDDING_MODEL
  || (embeddingProvider === 'google'
    ? 'text-embedding-004'
    : embeddingProvider === 'huggingface'
      ? 'sentence-transformers/all-MiniLM-L6-v2'
      : 'Xenova/all-MiniLM-L6-v2');
const defaultEmbeddingDimensions = process.env.EMBEDDING_DIMENSIONS
  || (embeddingProvider === 'google' ? '768' : '384');

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
    provider: embeddingProvider,
    model: defaultEmbeddingModel,
    dimensions: parseInt(defaultEmbeddingDimensions, 10),
    batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '20', 10),
    google: {
      apiKey: process.env.GOOGLE_API_KEY || '',
      baseUrl: process.env.GOOGLE_AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    },
    huggingface: {
      apiKey: process.env.HUGGINGFACE_API_KEY || '',
      baseUrl:
        process.env.HUGGINGFACE_BASE_URL
        || 'https://api-inference.huggingface.co/pipeline/feature-extraction',
    },
    local: {
      cacheDir: process.env.EMBEDDING_MODEL_CACHE_DIR || '',
    },
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

  chunking: {
    targetTokens: parseInt(process.env.CHUNK_TARGET_TOKENS || '750', 10),
    maxTokens: parseInt(process.env.CHUNK_MAX_TOKENS || '900', 10),
    overlapTokens: parseInt(process.env.CHUNK_OVERLAP_TOKENS || '150', 10),
  },
};
