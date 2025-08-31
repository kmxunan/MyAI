const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Connect to Redis
 * @returns {Promise<void>}
 */
const connectRedis = async () => {
  try {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: process.env.REDIS_DB || 0,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };

    // Create Redis client
    redisClient = redis.createClient({
      socket: {
        host: redisConfig.host,
        port: redisConfig.port,
        connectTimeout: redisConfig.connectTimeout,
        commandTimeout: redisConfig.commandTimeout,
        keepAlive: redisConfig.keepAlive,
      },
      password: redisConfig.password,
      database: redisConfig.db,
      retryDelayOnFailover: redisConfig.retryDelayOnFailover,
      enableReadyCheck: redisConfig.enableReadyCheck,
      maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
      lazyConnect: redisConfig.lazyConnect,
    });

    // Event handlers
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready', {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db,
      });
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    redisClient.on('end', () => {
      logger.warn('Redis client disconnected');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });

    // Connect to Redis
    await redisClient.connect();

    logger.info('Redis connected successfully');

    // Handle process termination
    process.on('SIGINT', async () => {
      try {
        await redisClient.quit();
        logger.info('Redis connection closed through app termination');
      } catch (err) {
        logger.error('Error closing Redis connection:', err);
      }
    });
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
};

/**
 * Disconnect from Redis
 * @returns {Promise<void>}
 */
const disconnectRedis = async () => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      logger.info('Redis disconnected successfully');
    }
  } catch (error) {
    logger.error('Error disconnecting from Redis:', error);
    throw error;
  }
};

/**
 * Get Redis client instance
 * @returns {Object} Redis client
 */
const getRedisClient = () => {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client is not connected');
  }
  return redisClient;
};

/**
 * Cache operations
 */
const cache = {
  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {any} value - Cache value
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<string>}
   */
  async set(key, value, ttl = 3600) {
    try {
      const client = getRedisClient();
      const serializedValue = JSON.stringify(value);

      if (ttl > 0) {
        return await client.setEx(key, ttl, serializedValue);
      }
      return await client.set(key, serializedValue);
    } catch (error) {
      logger.error('Cache set error:', error);
      throw error;
    }
  },

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @returns {Promise<any>}
   */
  async get(key) {
    try {
      const client = getRedisClient();
      const value = await client.get(key);

      if (value === null) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      logger.error('Cache get error:', error);
      throw error;
    }
  },

  /**
   * Delete cache value
   * @param {string} key - Cache key
   * @returns {Promise<number>}
   */
  async del(key) {
    try {
      const client = getRedisClient();
      return await client.del(key);
    } catch (error) {
      logger.error('Cache delete error:', error);
      throw error;
    }
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    try {
      const client = getRedisClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      throw error;
    }
  },

  /**
   * Set expiration time
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>}
   */
  async expire(key, ttl) {
    try {
      const client = getRedisClient();
      const result = await client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error:', error);
      throw error;
    }
  },

  /**
   * Get keys by pattern
   * @param {string} pattern - Key pattern
   * @returns {Promise<Array>}
   */
  async keys(pattern) {
    try {
      const client = getRedisClient();
      return await client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      throw error;
    }
  },

  /**
   * Clear all cache
   * @returns {Promise<string>}
   */
  async clear() {
    try {
      const client = getRedisClient();
      return await client.flushDb();
    } catch (error) {
      logger.error('Cache clear error:', error);
      throw error;
    }
  },
};

/**
 * Health check for Redis connection
 * @returns {Promise<Object>} Health status
 */
const healthCheck = async () => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return {
        status: 'unhealthy',
        message: 'Redis client is not connected',
        timestamp: new Date().toISOString(),
      };
    }

    // Test Redis operation
    await redisClient.ping();

    return {
      status: 'healthy',
      message: 'Redis connection is working',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return {
      status: 'unhealthy',
      message: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

module.exports = {
  connectRedis,
  disconnectRedis,
  getRedisClient,
  cache,
  healthCheck,
};
