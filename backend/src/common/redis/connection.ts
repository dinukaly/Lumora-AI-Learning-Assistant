import { config } from '../../config/index.js';

type RedisConnectionConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
};

type RedisClientOverrides = {
  lazyConnect?: boolean;
  enableOfflineQueue?: boolean;
  maxRetriesPerRequest?: number | null;
  connectTimeout?: number;
};

export function getRedisConnectionOptions(): RedisConnectionConfig {
  if (config.redis.url) {
    const parsed = new URL(config.redis.url);
    const port = parsed.port ? parseInt(parsed.port, 10) : parsed.protocol === 'rediss:' ? 6380 : 6379;

    return {
      host: parsed.hostname,
      port,
      username: parsed.username ? decodeURIComponent(parsed.username) : config.redis.username,
      password: parsed.password ? decodeURIComponent(parsed.password) : config.redis.password,
      tls: parsed.protocol === 'rediss:' || config.redis.tls ? {} : undefined,
    };
  }

  return {
    host: config.redis.host,
    port: config.redis.port,
    username: config.redis.username,
    password: config.redis.password,
    tls: config.redis.tls ? {} : undefined,
  };
}

export function getRedisClientOptions(overrides: RedisClientOverrides = {}) {
  return {
    ...getRedisConnectionOptions(),
    ...overrides,
  };
}
