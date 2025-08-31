const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/**
 * RAG服务配置管理模块
 * 统一管理RAG服务的所有环境变量和配置项
 */
class RAGConfigManager {
  constructor() {
    this.env = process.env.NODE_ENV || 'development';
    this.config = this.loadConfig();
    this.validateConfig();
  }

  loadConfig() {
    return {
      // 服务器配置
      server: {
        port: this.getNumber('RAG_PORT', 8000),
        host: this.getString('RAG_HOST', '0.0.0.0'),
        env: this.env,
        corsOrigins: this.getArray('RAG_ALLOWED_ORIGINS', ['http://localhost:3000', 'http://localhost:5000'])
      },

      // 数据库配置
      database: {
        mongodb: {
          uri: this.getString('RAG_MONGODB_URI', 'mongodb://localhost:27017/myai_rag'),
          testUri: this.getString('RAG_MONGODB_TEST_URI', 'mongodb://localhost:27017/myai_rag_test'),
          options: {
            maxPoolSize: this.getNumber('RAG_MONGODB_MAX_POOL_SIZE', 10),
            serverSelectionTimeoutMS: this.getNumber('RAG_MONGODB_TIMEOUT', 5000)
          }
        }
      },

      // OpenRouter API 配置
      openrouter: {
        apiKey: this.getString('RAG_OPENROUTER_API_KEY', ''),
        baseUrl: this.getString('RAG_OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
        embeddingModel: this.getString('RAG_EMBEDDING_MODEL', 'text-embedding-3-small'),
        chatModel: this.getString('RAG_CHAT_MODEL', 'openai/gpt-3.5-turbo'),
        timeout: this.getNumber('RAG_OPENROUTER_TIMEOUT', 30000),
        maxRetries: this.getNumber('RAG_OPENROUTER_MAX_RETRIES', 3)
      },

      // 向量数据库配置
      vector: {
        provider: this.getString('VECTOR_DB_PROVIDER', 'milvus'), // milvus, pinecone, weaviate
        milvus: {
          host: this.getString('MILVUS_HOST', 'localhost'),
          port: this.getNumber('MILVUS_PORT', 19530),
          username: this.getString('MILVUS_USERNAME', ''),
          password: this.getString('MILVUS_PASSWORD', ''),
          database: this.getString('MILVUS_DATABASE', 'default'),
          collection: this.getString('MILVUS_COLLECTION', 'documents'),
          dimension: this.getNumber('VECTOR_DIMENSION', 1536),
          indexType: this.getString('MILVUS_INDEX_TYPE', 'IVF_FLAT'),
          metricType: this.getString('MILVUS_METRIC_TYPE', 'L2')
        },
        pinecone: {
          apiKey: this.getString('PINECONE_API_KEY', ''),
          environment: this.getString('PINECONE_ENVIRONMENT', ''),
          indexName: this.getString('PINECONE_INDEX_NAME', 'myai-documents')
        }
      },

      // 嵌入模型配置
      embedding: {
        model: this.getString('EMBEDDING_MODEL', 'text-embedding-3-small'),
        dimension: this.getNumber('EMBEDDING_DIMENSION', 1536),
        batchSize: this.getNumber('EMBEDDING_BATCH_SIZE', 100),
        maxTokens: this.getNumber('EMBEDDING_MAX_TOKENS', 8191),
        timeout: this.getNumber('EMBEDDING_TIMEOUT', 30000)
      },

      // 文档处理配置
      document: {
        uploadDir: this.getString('RAG_UPLOAD_DIR', 'uploads'),
        tempDir: this.getString('RAG_TEMP_DIR', 'temp'),
        maxFileSize: this.getNumber('RAG_MAX_FILE_SIZE', 50 * 1024 * 1024), // 50MB
        allowedTypes: this.getArray('RAG_ALLOWED_FILE_TYPES', ['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xlsx']),
        chunkSize: this.getNumber('CHUNK_SIZE', 1000),
        chunkOverlap: this.getNumber('CHUNK_OVERLAP', 200),
        minChunkSize: this.getNumber('MIN_CHUNK_SIZE', 100),
        maxChunkSize: this.getNumber('MAX_CHUNK_SIZE', 2000)
      },

      // 搜索配置
      search: {
        defaultTopK: this.getNumber('SEARCH_TOP_K', 5),
        maxTopK: this.getNumber('SEARCH_MAX_TOP_K', 20),
        similarityThreshold: this.getNumber('SIMILARITY_THRESHOLD', 0.7),
        hybridSearch: this.getBoolean('HYBRID_SEARCH_ENABLED', true),
        rerankModel: this.getString('RERANK_MODEL', ''),
        rerankTopK: this.getNumber('RERANK_TOP_K', 10)
      },

      // 缓存配置
      cache: {
        enabled: this.getBoolean('CACHE_ENABLED', true),
        redis: {
          url: this.getString('RAG_REDIS_URL', 'redis://localhost:6379'),
          password: this.getString('RAG_REDIS_PASSWORD', ''),
          keyPrefix: this.getString('RAG_REDIS_PREFIX', 'rag:'),
          ttl: this.getNumber('CACHE_TTL', 3600) // 1 hour
        },
        memory: {
          maxSize: this.getNumber('MEMORY_CACHE_SIZE', 100),
          ttl: this.getNumber('MEMORY_CACHE_TTL', 300) // 5 minutes
        }
      },

      // RAG 生成配置
      rag: {
        maxContextLength: this.getNumber('RAG_MAX_CONTEXT_LENGTH', 4000),
        temperature: this.getNumber('RAG_TEMPERATURE', 0.7),
        maxTokens: this.getNumber('RAG_MAX_TOKENS', 1000),
        systemPrompt: this.getString('RAG_SYSTEM_PROMPT', 
          '你是一个智能助手，基于提供的文档内容回答用户问题。请确保回答准确、相关且有帮助。'
        ),
        includeSource: this.getBoolean('RAG_INCLUDE_SOURCE', true),
        streamResponse: this.getBoolean('RAG_STREAM_RESPONSE', true)
      },

      // 日志配置
      logging: {
        level: this.getString('RAG_LOG_LEVEL', 'info'),
        dir: this.getString('RAG_LOG_DIR', 'logs'),
        maxSize: this.getString('RAG_LOG_MAX_SIZE', '20m'),
        maxFiles: this.getString('RAG_LOG_MAX_FILES', '14d'),
        verbose: this.getBoolean('RAG_VERBOSE_LOGGING', false)
      },

      // 安全配置
      security: {
        apiKey: this.getString('RAG_API_KEY', ''),
        rateLimitWindowMs: this.getNumber('RAG_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
        rateLimitMaxRequests: this.getNumber('RAG_RATE_LIMIT_MAX_REQUESTS', 100),
        allowedIPs: this.getArray('RAG_ALLOWED_IPS', []),
        corsEnabled: this.getBoolean('RAG_CORS_ENABLED', true)
      },

      // 性能配置
      performance: {
        maxConcurrentRequests: this.getNumber('RAG_MAX_CONCURRENT_REQUESTS', 10),
        requestTimeout: this.getNumber('RAG_REQUEST_TIMEOUT', 30000),
        keepAliveTimeout: this.getNumber('RAG_KEEP_ALIVE_TIMEOUT', 5000),
        headersTimeout: this.getNumber('RAG_HEADERS_TIMEOUT', 60000)
      },

      // 开发配置
      development: {
        debug: this.getBoolean('RAG_DEBUG', this.env === 'development'),
        mockData: this.getBoolean('RAG_USE_MOCK_DATA', false),
        skipAuth: this.getBoolean('RAG_SKIP_AUTH', false),
        enableMetrics: this.getBoolean('RAG_ENABLE_METRICS', true)
      },

      // 主服务器配置
      mainServer: {
        url: this.getString('MAIN_SERVER_URL', 'http://localhost:5000'),
        apiKey: this.getString('MAIN_SERVER_API_KEY', ''),
        timeout: this.getNumber('MAIN_SERVER_TIMEOUT', 10000)
      }
    };
  }

  validateConfig() {
    const errors = [];

    // 验证必需的配置项
    if (this.env === 'production') {
      if (!this.config.openrouter.apiKey) {
        errors.push('RAG_OPENROUTER_API_KEY is required in production');
      }
      if (!this.config.security.apiKey) {
        errors.push('RAG_API_KEY is required in production');
      }
    }

    // 验证数据库连接字符串
    if (!this.config.database.mongodb.uri.startsWith('mongodb://') && 
        !this.config.database.mongodb.uri.startsWith('mongodb+srv://')) {
      errors.push('RAG_MONGODB_URI must be a valid MongoDB connection string');
    }

    // 验证端口号
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      errors.push('RAG_PORT must be between 1 and 65535');
    }

    // 验证向量维度
    if (this.config.embedding.dimension < 1 || this.config.embedding.dimension > 4096) {
      errors.push('EMBEDDING_DIMENSION must be between 1 and 4096');
    }

    // 验证分块配置
    if (this.config.document.chunkSize < this.config.document.minChunkSize) {
      errors.push('CHUNK_SIZE must be greater than MIN_CHUNK_SIZE');
    }

    if (this.config.document.chunkOverlap >= this.config.document.chunkSize) {
      errors.push('CHUNK_OVERLAP must be less than CHUNK_SIZE');
    }

    // 验证搜索配置
    if (this.config.search.defaultTopK > this.config.search.maxTopK) {
      errors.push('SEARCH_TOP_K must not exceed SEARCH_MAX_TOP_K');
    }

    if (errors.length > 0) {
      logger.error('RAG Configuration validation errors:');
      errors.forEach(error => logger.error(`  - ${error}`));
      
      if (this.env === 'production') {
        throw new Error('RAG Configuration validation failed in production environment');
      } else {
        logger.warn('RAG Configuration validation failed, but continuing in development mode');
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

  getDatabaseUri() {
    return this.isTest() 
      ? this.config.database.mongodb.testUri 
      : this.config.database.mongodb.uri;
  }

  ensureDirectories() {
    const dirs = [
      this.config.document.uploadDir,
      this.config.document.tempDir,
      this.config.logging.dir
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.log(`Created directory: ${dir}`);
      }
    });
  }

  printConfigSummary() {
    const summary = {
      environment: this.env,
      server: {
        port: this.config.server.port,
        host: this.config.server.host
      },
      database: {
        mongodb: this.config.database.mongodb.uri.replace(/\/\/.*@/, '//***:***@')
      },
      vector: {
        provider: this.config.vector.provider,
        dimension: this.config.embedding.dimension
      },
      openrouter: {
        baseUrl: this.config.openrouter.baseUrl,
        embeddingModel: this.config.openrouter.embeddingModel,
        chatModel: this.config.openrouter.chatModel,
        hasApiKey: !!this.config.openrouter.apiKey
      },
      document: {
        uploadDir: this.config.document.uploadDir,
        maxFileSize: `${Math.round(this.config.document.maxFileSize / 1024 / 1024)}MB`,
        chunkSize: this.config.document.chunkSize,
        chunkOverlap: this.config.document.chunkOverlap
      },
      search: {
        defaultTopK: this.config.search.defaultTopK,
        similarityThreshold: this.config.search.similarityThreshold
      }
    };

    logger.log('RAG Service Configuration Summary:');
    logger.log(JSON.stringify(summary, null, 2));
  }
}

// 创建单例实例
const ragConfigManager = new RAGConfigManager();

// 导出配置对象和管理器
module.exports = {
  config: ragConfigManager.config,
  configManager: ragConfigManager,
  // 便捷访问方法
  get: (path) => ragConfigManager.get(path),
  isDevelopment: () => ragConfigManager.isDevelopment(),
  isProduction: () => ragConfigManager.isProduction(),
  isTest: () => ragConfigManager.isTest(),
  getDatabaseUri: () => ragConfigManager.getDatabaseUri()
};