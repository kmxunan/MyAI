const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');
const fs = require('fs');

// 导入配置和工具
const { config, configManager } = require('./config');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// 导入路由
const healthRoutes = require('./routes/health');
const knowledgeBaseRoutes = require('./routes/knowledgeBase');
const documentRoutes = require('./routes/document');
const searchRoutes = require('./routes/search');
const chatRoutes = require('./routes/chat');

// 导入服务（用于初始化）
const VectorDBService = require('./services/vectorService');
const embeddingService = require('./services/embeddingService');
const documentProcessor = require('./services/documentProcessor');

class RAGServiceApp {
  constructor() {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;

    // 初始化应用
    this.initializeApp();
  }

  /**
   * 初始化应用
   */
  async initializeApp() {
    try {
      // 设置基础中间件
      this.setupMiddleware();

      // 设置路由
      this.setupRoutes();

      // 设置错误处理
      this.setupErrorHandling();

      // 设置API文档
      this.setupSwagger();

      logger.info('RAG Service application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize RAG Service application', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 设置中间件
   */
  setupMiddleware() {
    // 信任代理（用于获取真实IP）
    this.app.set('trust proxy', 1);

    // 安全中间件
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ['\'self\''],
          styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com'],
          fontSrc: ['\'self\'', 'https://fonts.gstatic.com'],
          imgSrc: ['\'self\'', 'data:', 'https:'],
          scriptSrc: ['\'self\''],
          connectSrc: ['\'self\''],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS配置
    const corsOptions = {
      origin: (origin, callback) => {
        const allowedOrigins = config.server.corsOrigins;

        // 允许没有origin的请求（如移动应用、Postman等）
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || config.development.debug) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
      exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    };
    this.app.use(cors(corsOptions));

    // 压缩响应
    this.app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024, // 只压缩大于1KB的响应
    }));

    // 请求体解析
    this.app.use(express.json({
      limit: `${Math.round(config.document.maxFileSize / 1024 / 1024)}mb`,
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    }));
    this.app.use(express.urlencoded({
      extended: true,
      limit: `${Math.round(config.document.maxFileSize / 1024 / 1024)}mb`,
    }));

    // 数据清理和安全
    this.app.use(mongoSanitize()); // 防止NoSQL注入
    this.app.use(xss()); // 防止XSS攻击
    this.app.use(hpp()); // 防止HTTP参数污染

    // 全局速率限制
    const globalLimiter = rateLimit({
      windowMs: config.security.rateLimitWindowMs,
      max: config.security.rateLimitMaxRequests,
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(config.security.rateLimitWindowMs / 1000),
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/health' || req.path === '/health/live' || req.path === '/health/ready',

    });
    this.app.use(globalLimiter);

    // 请求日志中间件
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });

    // 静态文件服务（如果需要）
    const uploadsDir = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      this.app.use('/uploads', express.static(uploadsDir, {
        maxAge: '1d',
        etag: true,
        lastModified: true,
      }));
    }

    // 请求ID中间件
    this.app.use((req, res, next) => {
      req.id = require('crypto').randomUUID(); // eslint-disable-line global-require
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    // 响应时间中间件
    this.app.use((req, res, next) => {
      const start = Date.now();

      // 重写res.end方法来在响应发送前设置响应时间
      const originalEnd = res.end;
      res.end = function (...args) {
        const duration = Date.now() - start;
        res.setHeader('X-Response-Time', `${duration}ms`);

        // 记录慢请求
        if (duration > (parseInt(process.env.SLOW_REQUEST_THRESHOLD, 10) || 1000)) {
          logger.warn('Slow request detected', {
            method: req.method,
            url: req.url,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            requestId: req.id,
          });
        }

        originalEnd.apply(this, args);
      };

      next();
    });
  }

  /**
   * 设置路由
   */
  setupRoutes() {
    // API版本前缀
    const apiPrefix = process.env.API_PREFIX || '/api/v1';

    // 根路径重定向到健康检查
    this.app.get('/', (req, res) => {
      res.redirect('/health');
    });

    // API路由
    this.app.use('/health', healthRoutes);
    this.app.use(`${apiPrefix}/knowledge-bases`, knowledgeBaseRoutes);
    this.app.use(`${apiPrefix}/documents`, documentRoutes);
    this.app.use(`${apiPrefix}/search`, searchRoutes);
    this.app.use(`${apiPrefix}/chat`, chatRoutes);

    // API信息端点
    this.app.get(`${apiPrefix}/info`, (req, res) => {
      res.json({
        name: 'RAG Service API',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Retrieval-Augmented Generation Service for MyAI Platform',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        endpoints: {
          health: '/health',
          docs: '/api-docs',
          knowledgeBases: `${apiPrefix}/knowledge-bases`,
          documents: `${apiPrefix}/documents`,
          search: `${apiPrefix}/search`,
          chat: `${apiPrefix}/chat`,
        },
      });
    });
  }

  /**
   * 设置错误处理
   */
  setupErrorHandling() {
    // 404处理
    this.app.use('*', notFound);

    // 全局错误处理
    this.app.use(errorHandler);
  }

  /**
   * 设置Swagger API文档
   */
  setupSwagger() {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'RAG Service API',
          version: process.env.npm_package_version || '1.0.0',
          description: 'Retrieval-Augmented Generation Service for MyAI Platform',
          contact: {
            name: 'MyAI Team',
            email: 'support@myai.com',
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT',
          },
        },
        servers: [
          {
            url: process.env.API_BASE_URL || 'http://localhost:3002',
            description: 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
            apiKey: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key',
            },
          },
          schemas: {
            Error: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: { type: 'string' },
                message: { type: 'string' },
                statusCode: { type: 'integer' },
                timestamp: { type: 'string', format: 'date-time' },
                path: { type: 'string' },
                requestId: { type: 'string' },
              },
            },
            Success: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                data: { type: 'object' },
                message: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
                requestId: { type: 'string' },
              },
            },
          },
        },
        security: [
          { bearerAuth: [] },
          { apiKey: [] },
        ],
      },
      apis: [
        './routes/*.js',
        './models/*.js',
      ],
    };

    const specs = swaggerJsdoc(swaggerOptions);

    // Swagger UI配置
    const swaggerUiOptions = {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'RAG Service API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      },
    };

    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerUiOptions));

    // 提供原始OpenAPI规范
    this.app.get('/api-docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(specs);
    });
  }

  /**
   * 启动服务器
   */
  async start() {
    try {
      // 连接数据库
      logger.info('Connecting to databases...');
      await connectDB();
      await connectRedis();

      // 初始化服务
      logger.info('Initializing services...');
      await RAGServiceApp.initializeServices();

      // 启动HTTP服务器
      const port = config.server.port;
      const host = config.server.host;

      this.server = this.app.listen(port, host, () => {
        logger.info('RAG Service started successfully', {
          port,
          host,
          environment: config.server.env,
          processId: process.pid,
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          memory: process.memoryUsage(),
          uptime: process.uptime(),
        });

        logger.info('Available endpoints:', {
          health: `http://${host}:${port}/health`,
          docs: `http://${host}:${port}/api-docs`,
          api: `http://${host}:${port}/api/v1`,
        });
      });

      // 设置服务器配置
      this.server.keepAliveTimeout = config.performance.keepAliveTimeout;
      this.server.headersTimeout = config.performance.headersTimeout;
      this.server.timeout = config.performance.requestTimeout;

      // 设置优雅关闭
      this.setupGracefulShutdown();

      return this.server;
    } catch (error) {
      logger.error('Failed to start RAG Service', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 初始化服务
   */
  static async initializeServices() {
    try {
      // 初始化向量数据库服务
      try {
        await VectorDBService.connect();
        logger.info('Vector database service initialized');
      } catch (error) {
        logger.warn('Vector database service failed to initialize, continuing without it', {
          error: error.message,
        });
      }

      // 初始化嵌入服务
      await embeddingService.validateConfig();
      logger.info('Embedding service initialized');

      // 初始化文档处理服务
      await documentProcessor.ensureTempDir();
      logger.info('Document processor service initialized');

      // 清理旧的临时文件
      await documentProcessor.cleanupOldTempFiles();
      logger.info('Temporary files cleanup completed');
    } catch (error) {
      logger.error('Failed to initialize services', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 设置优雅关闭
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress, forcing exit...');
        process.exit(1);
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // 设置关闭超时
      const shutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, parseInt(process.env.SHUTDOWN_TIMEOUT, 10) || 30000);

      try {
        // 停止接受新连接
        if (this.server) {
          this.server.close(() => {
            logger.info('HTTP server closed');
          });
        }

        // 关闭数据库连接
        const { disconnectDB } = require('./config/database'); // eslint-disable-line global-require
        await disconnectDB();
        logger.info('Database disconnected');

        // 关闭Redis连接
        const { disconnectRedis } = require('./config/redis'); // eslint-disable-line global-require
        await disconnectRedis();
        logger.info('Redis disconnected');

        // 关闭向量数据库连接
        await VectorDBService.disconnect();
        logger.info('Vector database disconnected');

        clearTimeout(shutdownTimeout);
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', {
          error: error.message,
          stack: error.stack,
        });
        clearTimeout(shutdownTimeout);
        process.exit(1);
      }
    };

    // 监听关闭信号
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
      });
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined,
        promise: promise.toString(),
      });
      shutdown('unhandledRejection');
    });
  }

  /**
   * 停止服务器
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(resolve);
      });
    }
  }

  /**
   * 获取应用实例
   */
  getApp() {
    return this.app;
  }

  /**
   * 获取服务器实例
   */
  getServer() {
    return this.server;
  }
}

// 创建应用实例
const ragServiceApp = new RAGServiceApp();

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  ragServiceApp.start().catch((error) => {
    logger.error('Failed to start application', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

module.exports = {
  RAGServiceApp,
  app: ragServiceApp.getApp(),
  start: () => ragServiceApp.start(),
  stop: () => ragServiceApp.stop(),
};
