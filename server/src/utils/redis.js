const redis = require('redis');
const logger = require('./logger');

let redisClient = null;

const connectRedis = async () => {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('Redis server connection refused');
          return new Error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          logger.error('Redis max retry attempts reached');
          return undefined;
        }
        // Reconnect after
        return Math.min(options.attempt * 100, 3000);
      }
    });

    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
      logger.info('Redis client disconnected');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

// Cache helper functions
const cache = {
  async get(key) {
    try {
      const client = getRedisClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },

  async set(key, value, ttl = 3600) {
    try {
      const client = getRedisClient();
      await client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  },

  async del(key) {
    try {
      const client = getRedisClient();
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  },

  async exists(key) {
    try {
      const client = getRedisClient();
      const exists = await client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  },

  async flush() {
    try {
      const client = getRedisClient();
      await client.flushAll();
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  },

  // Pattern-based operations
  async keys(pattern) {
    try {
      const client = getRedisClient();
      return await client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  },

  async deletePattern(pattern) {
    try {
      const client = getRedisClient();
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
      return keys.length;
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
      return 0;
    }
  }
};

// Session management
const session = {
  async create(sessionId, data, ttl = 86400) { // 24 hours default
    return await cache.set(`session:${sessionId}`, data, ttl);
  },

  async get(sessionId) {
    return await cache.get(`session:${sessionId}`);
  },

  async update(sessionId, data, ttl = 86400) {
    return await cache.set(`session:${sessionId}`, data, ttl);
  },

  async destroy(sessionId) {
    return await cache.del(`session:${sessionId}`);
  },

  async exists(sessionId) {
    return await cache.exists(`session:${sessionId}`);
  }
};

// Rate limiting helpers
const rateLimit = {
  async increment(key, window = 3600) {
    try {
      const client = getRedisClient();
      const current = await client.incr(key);
      if (current === 1) {
        await client.expire(key, window);
      }
      return current;
    } catch (error) {
      logger.error('Rate limit increment error:', error);
      return 0;
    }
  },

  async get(key) {
    try {
      const client = getRedisClient();
      const value = await client.get(key);
      return parseInt(value) || 0;
    } catch (error) {
      logger.error('Rate limit get error:', error);
      return 0;
    }
  },

  async reset(key) {
    return await cache.del(key);
  }
};

module.exports = {
  connectRedis,
  getRedisClient,
  cache,
  session,
  rateLimit
};
