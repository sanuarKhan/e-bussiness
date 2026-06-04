"use strict";

const Redis = require("ioredis");
const logger = require("../utils/logger");

let redisClient;

const redisOptions = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === "true" ? {} : undefined,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error("Redis: Max retry attempts reached");
      return null; // stop retrying
    }
    const delay = Math.min(times * 500, 5000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetErrors = ["READONLY", "ETIMEDOUT"];
    if (targetErrors.some((target) => err.message.includes(target))) {
      return true;
    }
    return false;
  },
};

const connectRedis = async () => {
  redisClient = new Redis(redisOptions);

  redisClient.on("connect", () => {
    logger.info(
      `Redis connected: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    );
  });

  redisClient.on("error", (err) => {
    logger.error("Redis error:", err.message);
  });

  redisClient.on("close", () => {
    logger.warn("Redis connection closed");
  });

  redisClient.on("reconnecting", (delay) => {
    logger.warn(`Redis reconnecting in ${delay}ms`);
  });

  await redisClient.connect();
  return redisClient;
};

// ─── Cache Utilities ────────────────────────────────────────────────────────
const DEFAULT_TTL = 3600; // 1 hour

const cache = {
  /**
   * Get cached value. Returns parsed JSON or null.
   */
  get: async (key) => {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.error(`Cache GET error for key "${key}":`, err);
      return null;
    }
  },

  /**
   * Set cache value with TTL (seconds).
   */
  set: async (key, value, ttl = DEFAULT_TTL) => {
    try {
      await redisClient.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (err) {
      logger.error(`Cache SET error for key "${key}":`, err);
      return false;
    }
  },

  /**
   * Delete one or multiple cache keys.
   */
  del: async (...keys) => {
    try {
      if (keys.length === 0) return 0;
      return await redisClient.del(...keys);
    } catch (err) {
      logger.error("Cache DEL error:", err);
      return 0;
    }
  },

  /**
   * Delete all keys matching a pattern.
   */
  delPattern: async (pattern) => {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length === 0) return 0;
      return await redisClient.del(...keys);
    } catch (err) {
      logger.error(`Cache DEL pattern error for "${pattern}":`, err);
      return 0;
    }
  },

  /**
   * Cache-aside pattern: get from cache, or fetch from source and cache.
   */
  remember: async (key, ttl, fetchFn) => {
    const cached = await cache.get(key);
    if (cached !== null) return cached;

    const fresh = await fetchFn();
    if (fresh !== null && fresh !== undefined) {
      await cache.set(key, fresh, ttl);
    }
    return fresh;
  },

  /**
   * Check if a key exists in cache.
   */
  exists: async (key) => {
    try {
      return (await redisClient.exists(key)) === 1;
    } catch (err) {
      logger.error(`Cache EXISTS error for key "${key}":`, err);
      return false;
    }
  },

  /**
   * Increment a counter atomically.
   */
  incr: async (key, ttl = DEFAULT_TTL) => {
    try {
      const val = await redisClient.incr(key);
      if (val === 1 && ttl) await redisClient.expire(key, ttl);
      return val;
    } catch (err) {
      logger.error(`Cache INCR error for key "${key}":`, err);
      return null;
    }
  },
};

// ─── Session Store ─────────────────────────────────────────────────────────
const SESSION_PREFIX = "session:";
const session = {
  set: (id, data, ttl = 86400) =>
    cache.set(`${SESSION_PREFIX}${id}`, data, ttl),
  get: (id) => cache.get(`${SESSION_PREFIX}${id}`),
  del: (id) => cache.del(`${SESSION_PREFIX}${id}`),
};

// ─── Refresh Token Store ────────────────────────────────────────────────────
const RT_PREFIX = "refresh_token:";
const refreshTokens = {
  set: (userId, token, ttl = 604800) =>
    cache.set(`${RT_PREFIX}${userId}`, token, ttl),
  get: (userId) => cache.get(`${RT_PREFIX}${userId}`),
  del: (userId) => cache.del(`${RT_PREFIX}${userId}`),
};

module.exports = {
  connectRedis,
  get redisClient() {
    return redisClient;
  },
  cache,
  session,
  refreshTokens,
};
