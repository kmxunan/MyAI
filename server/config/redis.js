const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * 初始化 Redis 连接
 */
const initializeRedis = async () => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const redisPassword = process.env.REDIS_PASSWORD;
    
    const redisConfig = {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnClusterDown: 300
    };
    
    if (redisPassword) {
      redisConfig.password = redisPassword;
    }
    
    // 如果是完整的 Redis URL
    if (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://')) {
      redisClient = new Redis(redisUrl, redisConfig);
    } else {
      // 如果是主机:端口格式
      const [host, port] = redisUrl.split(':');
      redisClient = new Redis({
        host: host || 'localhost',
        port: parseInt(port) || 6379,
        ...redisConfig
      });
    }
    
    // 连接事件监听
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });
    
    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });
    
    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });
    
    redisClient.on('close', () => {
      logger.warn('Redis client connection closed');
    });
    
    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
    
    // 连接到 Redis
    await redisClient.connect();
    
    // 测试连接
    await redisClient.ping();
    logger.info('Redis connection established successfully');
    
    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error.message);
    throw error;
  }
};

/**
 * 获取 Redis 客户端实例
 */
const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
};

/**
 * 缓存操作封装
 */
const cache = {
  /**
   * 设置缓存
   * @param {string} key 缓存键
   * @param {any} value 缓存值
   * @param {number} ttl 过期时间（秒）
   */
  async set(key, value, ttl = 3600) {
    try {
      const client = getRedisClient();
      const serializedValue = JSON.stringify(value);
      if (ttl > 0) {
        await client.setex(key, ttl, serializedValue);
      } else {
        await client.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  },
  
  /**
   * 获取缓存
   * @param {string} key 缓存键
   */
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
  
  /**
   * 删除缓存
   * @param {string} key 缓存键
   */
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
  
  /**
   * 检查缓存是否存在
   * @param {string} key 缓存键
   */
  async exists(key) {
    try {
      const client = getRedisClient();
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  },
  
  /**
   * 设置缓存过期时间
   * @param {string} key 缓存键
   * @param {number} ttl 过期时间（秒）
   */
  async expire(key, ttl) {
    try {
      const client = getRedisClient();
      await client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Cache expire error:', error);
      return false;
    }
  },
  
  /**
   * 获取所有匹配的键
   * @param {string} pattern 匹配模式
   */
  async keys(pattern) {
    try {
      const client = getRedisClient();
      return await client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      return [];
    }
  },
  
  /**
   * 清空所有缓存
   */
  async flushAll() {
    try {
      const client = getRedisClient();
      await client.flushall();
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }
};

/**
 * 会话存储操作
 */
const session = {
  /**
   * 存储用户会话
   * @param {string} sessionId 会话ID
   * @param {object} sessionData 会话数据
   * @param {number} ttl 过期时间（秒）
   */
  async set(sessionId, sessionData, ttl = 86400) {
    const key = `session:${sessionId}`;
    return await cache.set(key, sessionData, ttl);
  },
  
  /**
   * 获取用户会话
   * @param {string} sessionId 会话ID
   */
  async get(sessionId) {
    const key = `session:${sessionId}`;
    return await cache.get(key);
  },
  
  /**
   * 删除用户会话
   * @param {string} sessionId 会话ID
   */
  async destroy(sessionId) {
    const key = `session:${sessionId}`;
    return await cache.del(key);
  }
};

/**
 * Redis 健康检查
 */
const checkRedisHealth = async () => {
  try {
    if (!redisClient) {
      return false;
    }
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};

/**
 * 关闭 Redis 连接
 */
const closeRedis = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      logger.info('Redis connection closed');
    }
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
};

module.exports = {
  initializeRedis,
  getRedisClient,
  cache,
  session,
  checkRedisHealth,
  closeRedis
};