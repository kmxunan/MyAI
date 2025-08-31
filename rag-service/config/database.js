const mongoose = require('mongoose');
const logger = require('../utils/logger');

class DatabaseConnection {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Connect to MongoDB database
   * @returns {Promise<void>}
   */
  async connect() {
    try {
      // 构建连接字符串
      const connectionString = this.buildConnectionString();

      // 连接选项
      const options = {
        // 连接池设置
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
        minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 2,
        maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_TIME, 10) || 30000,

        // 连接超时设置
        serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT, 10) || 5000,
        socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT, 10) || 45000,
        connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 10000,

        // 缓冲设置
        bufferCommands: false,

        // 其他设置
        retryWrites: true,
        retryReads: true,
        readPreference: process.env.DB_READ_PREFERENCE || 'primary',
        writeConcern: {
          w: process.env.DB_WRITE_CONCERN || 'majority',
          j: true,
          wtimeout: parseInt(process.env.DB_WRITE_TIMEOUT, 10) || 10000,
        },

        // 压缩
        compressors: ['zlib'],

        // 应用名称
        appName: 'RAG-Service',
      };

      // 设置事件监听器
      this.setupEventListeners();

      // 连接数据库
      logger.info('Connecting to MongoDB...', {
        host: process.env.DB_HOST || process.env.MONGODB_HOST || 'localhost',
        port: process.env.DB_PORT || process.env.MONGODB_PORT || '27017',
        database: process.env.DB_NAME || process.env.MONGODB_DB || 'myai-rag',
      });

      this.connection = await mongoose.connect(connectionString, options);
      this.isConnected = true;
      this.connectionAttempts = 0;

      logger.info('Successfully connected to MongoDB', {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name,
        readyState: mongoose.connection.readyState,
      });

      return this.connection;
    } catch (error) {
      this.isConnected = false;
      this.connectionAttempts++;

      logger.error('Failed to connect to MongoDB', {
        error: error.message,
        stack: error.stack,
        attempt: this.connectionAttempts,
        maxRetries: this.maxRetries,
      });

      // 重试连接
      if (this.connectionAttempts < this.maxRetries) {
        logger.info(`Retrying connection in ${this.retryDelay / 1000} seconds...`, {
          attempt: this.connectionAttempts + 1,
          maxRetries: this.maxRetries,
        });

        await this.delay(this.retryDelay);
        return this.connect();
      }
      logger.error('Max connection attempts reached. Giving up.', {
        maxRetries: this.maxRetries,
      });
      throw error;
    }
  }

  /**
   * 构建连接字符串
   */
  buildConnectionString() {
    // 支持多种环境变量格式
    const mongoURI = process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (mongoURI) {
      return mongoURI;
    }

    const {
      DB_HOST = process.env.MONGODB_HOST || 'localhost',
      DB_PORT = process.env.MONGODB_PORT || '27017',
      DB_NAME = process.env.MONGODB_DB || 'myai-rag',
      DB_USERNAME = process.env.MONGODB_USERNAME,
      DB_PASSWORD = process.env.MONGODB_PASSWORD,
      DB_AUTH_SOURCE = process.env.MONGODB_AUTH_SOURCE || 'admin',
      DB_REPLICA_SET = process.env.MONGODB_REPLICA_SET,
      DB_SSL = process.env.MONGODB_SSL || 'false',
      DB_SSL_VALIDATE = process.env.MONGODB_SSL_VALIDATE || 'true',
    } = process.env;

    let connectionString = 'mongodb://';

    // 添加认证信息
    if (DB_USERNAME && DB_PASSWORD) {
      connectionString += `${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(DB_PASSWORD)}@`;
    }

    // 添加主机和端口
    connectionString += `${DB_HOST}:${DB_PORT}`;

    // 添加数据库名称
    connectionString += `/${DB_NAME}`;

    // 添加查询参数
    const queryParams = [];

    if (DB_AUTH_SOURCE && DB_USERNAME) {
      queryParams.push(`authSource=${DB_AUTH_SOURCE}`);
    }

    if (DB_REPLICA_SET) {
      queryParams.push(`replicaSet=${DB_REPLICA_SET}`);
    }

    if (DB_SSL === 'true') {
      queryParams.push('ssl=true');
      if (DB_SSL_VALIDATE === 'false') {
        queryParams.push('sslValidate=false');
      }
    }

    if (queryParams.length > 0) {
      connectionString += `?${queryParams.join('&')}`;
    }

    return connectionString;
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 连接成功
    mongoose.connection.on('connected', () => {
      this.isConnected = true;
      logger.info('Mongoose connected to MongoDB');
    });

    // 连接错误
    mongoose.connection.on('error', (error) => {
      this.isConnected = false;
      logger.error('Mongoose connection error', {
        error: error.message,
        stack: error.stack,
      });
    });

    // 连接断开
    mongoose.connection.on('disconnected', () => {
      this.isConnected = false;
      logger.warn('Mongoose disconnected from MongoDB');
    });

    // 重新连接
    mongoose.connection.on('reconnected', () => {
      this.isConnected = true;
      logger.info('Mongoose reconnected to MongoDB');
    });

    // 连接关闭
    mongoose.connection.on('close', () => {
      this.isConnected = false;
      logger.info('Mongoose connection closed');
    });

    // 进程退出时关闭连接
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, closing database connection...');
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, closing database connection...');
      await this.disconnect();
      process.exit(0);
    });
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Disconnect from MongoDB
   * @returns {Promise<void>}
   */
  async disconnect() {
    try {
      if (this.isConnected) {
        await mongoose.connection.close();
        this.isConnected = false;
        logger.info('Successfully disconnected from MongoDB');
      } else {
        logger.info('Already disconnected from MongoDB');
      }
    } catch (error) {
      logger.error('Error disconnecting from MongoDB', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get database connection status
   * @returns {Object} Connection status information
   */
  getConnectionStatus() {
    const state = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    return {
      state: states[state] || 'unknown',
      isConnected: this.isConnected,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      collections: Object.keys(mongoose.connection.collections),
      connectionAttempts: this.connectionAttempts,
      maxRetries: this.maxRetries,
    };
  }

  /**
   * Health check for database connection
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const status = this.getConnectionStatus();

      if (status.state !== 'connected') {
        return {
          status: 'unhealthy',
          message: `Database is ${status.state}`,
          connection: status,
          timestamp: new Date().toISOString(),
        };
      }

      // Test database operation
      const startTime = Date.now();
      await mongoose.connection.db.admin().ping();
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        message: 'Database connection is working',
        connection: status,
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Database health check failed', {
        error: error.message,
        stack: error.stack,
      });
      return {
        status: 'unhealthy',
        message: error.message,
        connection: this.getConnectionStatus(),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 获取数据库统计信息
   * @returns {Promise<Object>} Database statistics
   */
  async getStats() {
    try {
      if (!this.isConnected) {
        throw new Error('Database not connected');
      }

      const { db } = mongoose.connection;
      const stats = await db.stats();

      return {
        database: mongoose.connection.name,
        collections: stats.collections,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize,
        indexes: stats.indexes,
        indexSize: stats.indexSize,
        objects: stats.objects,
        avgObjSize: stats.avgObjSize,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get database stats', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 清理数据库连接
   */
  async cleanup() {
    try {
      // 移除所有事件监听器
      mongoose.connection.removeAllListeners();

      // 关闭连接
      await this.disconnect();

      logger.info('Database cleanup completed');
    } catch (error) {
      logger.error('Error during database cleanup', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

// 创建单例实例
const dbConnection = new DatabaseConnection();

// 向后兼容的函数
const connectDB = () => dbConnection.connect();
const disconnectDB = () => dbConnection.disconnect();
const getConnectionStatus = () => dbConnection.getConnectionStatus();
const healthCheck = () => dbConnection.healthCheck();

module.exports = {
  DatabaseConnection,
  dbConnection,
  connectDB,
  disconnectDB,
  getConnectionStatus,
  healthCheck,
};
