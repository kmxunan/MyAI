const fs = require('fs');
const logger = require('../utils/logger');

/**
 * 配置管理模块
 * 统一管理所有环境变量和配置项
 */
class ConfigManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.config = this.loadConfig();
    this.validateConfig();
  }

  loadConfig() {
    return {
      // 服务器配置
      server: {
        port: this.getNumber('PORT', 5000),
        env: this.env,
        trustProxy: this.getBoolean('TRUST_PROXY', false),
        corsOrigins: this.getArray('ALLOWED_ORIGINS', ['http://localhost:3000', 'http://127.0.0.1:3000'])
      },

      // 数据库配置
      database: {
        mongodb: {
          uri: this.getString('MONGODB_URI', 'mongodb://localhost:27017/myai'),
          testUri: this.getString('MONGODB_TEST_URI', 'mongodb://localhost:27017/myai_test'),
          options: {
            maxPoolSize: this.getNumber('MONGODB_MAX_POOL_SIZE', 10),
            serverSelectionTimeoutMS: this.getNumber('MONGODB_TIMEOUT', 5000),
            socketTimeoutMS: this.getNumber('MONGODB_SOCKET_TIMEOUT', 45000)
          }
        },
        redis: {
          url: this.getString('REDIS_URL', 'redis://localhost:6379'),
          password: this.getString('REDIS_PASSWORD', ''),
          maxRetriesPerRequest: this.getNumber('REDIS_MAX_RETRIES', 3),
          retryDelayOnFailover: this.getNumber('REDIS_RETRY_DELAY', 100)
        }
      },

      // JWT 配置
      jwt: {
        secret: this.getString('JWT_SECRET', this.generateSecret()),
        refreshSecret: this.getString('JWT_REFRESH_SECRET', this.generateSecret()),
        expiresIn: this.getString('JWT_EXPIRES_IN', '15m'),
        refreshExpiresIn: this.getString('JWT_REFRESH_EXPIRES_IN', '7d'),
        issuer: this.getString('JWT_ISSUER', 'myai-server'),
        audience: this.getString('JWT_AUDIENCE', 'myai-client')
      },

      // OpenRouter API 配置
      openrouter: {
        apiKey: this.getString('OPENROUTER_API_KEY', ''),
        baseUrl: this.getString('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        defaultModel: this.getString('DEFAULT_MODEL', 'openai/gpt-3.5-turbo'),
        timeout: this.getNumber('OPENROUTER_TIMEOUT', 30000),
        maxRetries: this.getNumber('OPENROUTER_MAX_RETRIES', 3)
      },

      // 邮件配置
      email: {
        service: this.getString('EMAIL_SERVICE', ''),
        user: this.getString('EMAIL_USER', ''),
        password: this.getString('EMAIL_PASSWORD', ''),
        from: this.getString('EMAIL_FROM', 'noreply@myai.com'),
        smtp: {
          host: this.getString('SMTP_HOST', ''),
          port: this.getNumber('SMTP_PORT', 587),
          secure: this.getBoolean('SMTP_SECURE', false),
          user: this.getString('SMTP_USER', ''),
          password: this.getString('SMTP_PASSWORD', '')
        }
      },

      // 文件上传配置
      upload: {
        dir: this.getString('UPLOAD_DIR', 'uploads'),
        maxSize: this.getNumber('MAX_FILE_SIZE', 10 * 1024 * 1024), // 10MB
        allowedTypes: this.getArray('ALLOWED_FILE_TYPES', ['pdf', 'doc', 'docx', 'txt', 'csv', 'xlsx', 'xls']),
        tempDir: this.getString('TEMP_DIR', 'temp')
      },

      // RAG 服务配置
      rag: {
        serviceUrl: this.getString('RAG_SERVICE_URL', 'http://localhost:8000'),
        apiKey: this.getString('RAG_SERVICE_API_KEY', ''),
        timeout: this.getNumber('RAG_TIMEOUT', 30000)
      },

      // 向量数据库配置
      vector: {
        url: this.getString('VECTOR_DB_URL', 'http://localhost:19530'),
        token: this.getString('VECTOR_DB_TOKEN', ''),
        collectionName: this.getString('VECTOR_COLLECTION_NAME', 'documents')
      },

      // 日志配置
      logging: {
        level: this.getString('LOG_LEVEL', 'info'),
        dir: this.getString('LOG_DIR', 'logs'),
        maxSize: this.getString('LOG_MAX_SIZE', '20m'),
        maxFiles: this.getString('LOG_MAX_FILES', '14d'),
        verbose: this.getBoolean('VERBOSE_LOGGING', false)
      },

      // 安全配置
      security: {
        bcryptRounds: this.getNumber('BCRYPT_ROUNDS', 12),
        rateLimitWindowMs: this.getNumber('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
        rateLimitMaxRequests: this.getNumber('RATE_LIMIT_MAX_REQUESTS', 100),
        sessionSecret: this.getString('SESSION_SECRET', this.generateSecret()),
        sessionMaxAge: this.getNumber('SESSION_MAX_AGE', 24 * 60 * 60 * 1000),
        secureCookies: this.getBoolean('SECURE_COOKIES', this.env === 'production'),
        httpsOnly: this.getBoolean('HTTPS_ONLY', this.env === 'production')
      },

      // 客户端配置
      client: {
        url: this.getString('CLIENT_URL', 'http://localhost:3000')
      },

      // 开发配置
      development: {
        debug: this.getBoolean('DEBUG', this.env === 'development'),
        mockData: this.getBoolean('USE_MOCK_DATA', false),
        skipAuth: this.getBoolean('SKIP_AUTH', false)
      }
    };
  }

  validateConfig() {
    const errors = [];

    // 验证必需的配置项
    if (this.env === 'production') {
      if (!this.config.jwt.secret || this.config.jwt.secret.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters in production');
      }
      if (!this.config.security.sessionSecret || this.config.security.sessionSecret.length < 32) {
        errors.push('SESSION_SECRET must be at least 32 characters in production');
      }
      if (!this.config.openrouter.apiKey) {
        errors.push('OPENROUTER_API_KEY is required in production');
      }
    }

    // 验证数据库连接字符串
    if (!this.config.database.mongodb.uri.startsWith('mongodb://') && 
        !this.config.database.mongodb.uri.startsWith('mongodb+srv://')) {
      errors.push('MONGODB_URI must be a valid MongoDB connection string');
    }

    // 验证端口号
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      errors.push('PORT must be between 1 and 65535');
    }

    // 验证文件大小
    if (this.config.upload.maxSize < 1024) {
      errors.push('MAX_FILE_SIZE must be at least 1024 bytes');
    }

    if (errors.length > 0) {
      logger.error('Configuration validation errors:');
      errors.forEach(error => logger.error(`  - ${error}`));
      
      if (this.env === 'production') {
        throw new Error('Configuration validation failed in production environment');
      } else {
        logger.warn('Configuration validation failed, but continuing in development mode');
      }
    }
  }

  getString(key, defaultValue = '') {
    return process.env[key] || defaultValue;
  }

  getNumber(key, defaultValue = 0) {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  getBoolean(key, defaultValue = false) {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  getArray(key, defaultValue = []) {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  generateSecret() {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  get(path) {
    return this.getNestedValue(this.config, path);
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  isDevelopment() {
    return this.env === 'development';
  }

  isProduction() {
    return this.env === 'production';
  }

  isTest() {
    return this.env === 'test';
  }

  // 获取数据库URI（测试环境使用测试数据库）
  getDatabaseUri() {
    return this.isTest() 
      ? this.config.database.mongodb.testUri 
      : this.config.database.mongodb.uri;
  }

  // 创建上传目录
  ensureUploadDirectories() {
    const dirs = [
      this.config.upload.dir,
      this.config.upload.tempDir,
      this.config.logging.dir
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.log(`Created directory: ${dir}`);
      }
    });
  }

  // 打印配置摘要（隐藏敏感信息）
  printConfigSummary() {
    const summary = {
      environment: this.env,
      server: {
        port: this.config.server.port,
        corsOrigins: this.config.server.corsOrigins
      },
      database: {
        mongodb: this.config.database.mongodb.uri.replace(/\/\/.*@/, '//***:***@'),
        redis: this.config.database.redis.url.replace(/\/\/.*@/, '//***:***@')
      },
      openrouter: {
        baseUrl: this.config.openrouter.baseUrl,
        defaultModel: this.config.openrouter.defaultModel,
        hasApiKey: !!this.config.openrouter.apiKey
      },
      upload: {
        dir: this.config.upload.dir,
        maxSize: `${Math.round(this.config.upload.maxSize / 1024 / 1024)}MB`,
        allowedTypes: this.config.upload.allowedTypes
      },
      logging: {
        level: this.config.logging.level,
        dir: this.config.logging.dir
      }
    };

    logger.log('Configuration Summary:');
    logger.log(JSON.stringify(summary, null, 2));
  }
}

// 创建单例实例
const configManager = new ConfigManager();

// 导出配置对象和管理器
module.exports = {
  config: configManager.config,
  configManager,
  // 便捷访问方法
  get: (path) => configManager.get(path),
  isDevelopment: () => configManager.isDevelopment(),
  isProduction: () => configManager.isProduction(),
  isTest: () => configManager.isTest(),
  getDatabaseUri: () => configManager.getDatabaseUri()
};