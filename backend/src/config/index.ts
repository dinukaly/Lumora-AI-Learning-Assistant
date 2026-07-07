import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const environment = process.env.NODE_ENV || 'development';
const embeddingProvider = process.env.EMBEDDING_PROVIDER
  || (environment === 'production' ? 'google' : 'local');
const defaultEmbeddingModel = process.env.EMBEDDING_MODEL
  || (embeddingProvider === 'google'
    ? 'text-embedding-004'
    : embeddingProvider === 'huggingface'
      ? 'sentence-transformers/all-MiniLM-L6-v2'
      : 'Xenova/all-MiniLM-L6-v2');
const defaultEmbeddingDimensions = process.env.EMBEDDING_DIMENSIONS
  || (embeddingProvider === 'google' ? '768' : '384');

export const config = {
  env: environment,
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY, environment),

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

  // Storage — S3-compatible Cloudflare R2
  storage: {
    endpoint: process.env.S3_ENDPOINT || '',
    region: process.env.S3_REGION || 'auto',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    bucketName: process.env.S3_BUCKET_NAME || 'lumora-documents',
    useSsl: parseBoolean(process.env.S3_USE_SSL, true),
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || '',
    forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE, true),
    autoCreateBucket: parseBoolean(process.env.S3_AUTO_CREATE_BUCKET, false),
  },

  avatar: {
    maxUploadBytes: parseInt(process.env.AVATAR_MAX_UPLOAD_BYTES || '2097152', 10),
    outputSizePx: parseInt(process.env.AVATAR_OUTPUT_SIZE_PX || '256', 10),
    publicBaseUrl: process.env.AVATAR_PUBLIC_BASE_URL || '',
    storage: {
      endpoint: process.env.AVATAR_S3_ENDPOINT || process.env.S3_ENDPOINT || '',
      region: process.env.AVATAR_S3_REGION || process.env.S3_REGION || 'auto',
      accessKeyId: process.env.AVATAR_S3_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AVATAR_S3_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '',
      bucketName: process.env.AVATAR_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME || 'lumora-avatars',
      publicBaseUrl: process.env.AVATAR_PUBLIC_BASE_URL || '',
      forcePathStyle: parseBoolean(
        process.env.AVATAR_S3_FORCE_PATH_STYLE || process.env.S3_FORCE_PATH_STYLE,
        true,
      ),
      autoCreateBucket: parseBoolean(process.env.AVATAR_S3_AUTO_CREATE_BUCKET, false),
      missingConfigLabels: {
        endpoint: process.env.AVATAR_S3_ENDPOINT ? 'AVATAR_S3_ENDPOINT' : 'S3_ENDPOINT',
        accessKeyId: process.env.AVATAR_S3_ACCESS_KEY_ID
          ? 'AVATAR_S3_ACCESS_KEY_ID'
          : 'S3_ACCESS_KEY_ID',
        secretAccessKey: process.env.AVATAR_S3_SECRET_ACCESS_KEY
          ? 'AVATAR_S3_SECRET_ACCESS_KEY'
          : 'S3_SECRET_ACCESS_KEY',
        bucketName: process.env.AVATAR_S3_BUCKET_NAME ? 'AVATAR_S3_BUCKET_NAME' : 'S3_BUCKET_NAME',
      },
    },
  },

  // Redis — BullMQ job queue
  redis: {
    url: process.env.REDIS_URL || '',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: parseBoolean(process.env.REDIS_TLS, false),
  },

  rateLimit: {
    authWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10),
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
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

  vectorSearch: {
    indexName: process.env.VECTOR_SEARCH_INDEX_NAME || 'document_chunks_vector_idx',
    similarity: process.env.VECTOR_SEARCH_SIMILARITY || 'cosine',
    defaultLimit: parseInt(process.env.VECTOR_SEARCH_DEFAULT_LIMIT || '5', 10),
    numCandidatesMultiplier: parseInt(
      process.env.VECTOR_SEARCH_NUM_CANDIDATES_MULTIPLIER || '20',
      10,
    ),
    autoEnsureOnStartup: process.env.VECTOR_SEARCH_AUTO_ENSURE !== 'false',
    readyTimeoutMs: parseInt(process.env.VECTOR_SEARCH_READY_TIMEOUT_MS || '300000', 10),
    readyPollIntervalMs: parseInt(
      process.env.VECTOR_SEARCH_READY_POLL_INTERVAL_MS || '5000',
      10,
    ),
  },
};

function parseTrustProxy(value: string | undefined, env: string) {
  if (!value) {
    return env === 'production' ? 1 : false;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? value : numericValue;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
}
