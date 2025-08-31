// 简单的日志实现，避免winston兼容性问题
const logger = {
  info: (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [INFO]:`, message, ...args);
  },
  error: (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.error(`${timestamp} [ERROR]:`, message, ...args);
  },
  warn: (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.warn(`${timestamp} [WARN]:`, message, ...args);
  },
  debug: (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [DEBUG]:`, message, ...args);
  },
  verbose: (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [VERBOSE]:`, message, ...args);
  },
  http: (message, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [HTTP]:`, message, ...args);
  },
  log: (level, message, ...args) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [${level.toUpperCase()}]:`, message, ...args);
  },
  child: (meta) => {
    return {
      ...logger,
      meta
    };
  }
};

/**
 * 创建子 logger
 * @param {string} module 模块名称
 * @returns {Object} 子 logger 实例
 */
const createChildLogger = (module) => {
  return logger.child({ module });
};

/**
 * HTTP 请求日志中间件
 * @param {Object} req Express 请求对象
 * @param {Object} res Express 响应对象
 * @param {Function} next 下一个中间件
 */
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  // 记录请求开始
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  // 监听响应结束
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'http';
    
    logger.log(logLevel, 'HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
  });
  
  next();
};

/**
 * 数据库操作日志
 * @param {string} operation 操作类型
 * @param {string} collection 集合名称
 * @param {Object} query 查询条件
 * @param {number} duration 执行时间
 */
const dbLogger = (operation, collection, query = {}, duration = 0) => {
  logger.debug('Database Operation', {
    operation,
    collection,
    query: JSON.stringify(query),
    duration: `${duration}ms`,
    timestamp: new Date().toISOString()
  });
};

/**
 * AI API 调用日志
 * @param {string} provider AI 提供商
 * @param {string} model 模型名称
 * @param {number} tokens 使用的 token 数量
 * @param {number} duration 执行时间
 * @param {string} status 调用状态
 */
const aiLogger = (provider, model, tokens = 0, duration = 0, status = 'success') => {
  logger.info('AI API Call', {
    provider,
    model,
    tokens,
    duration: `${duration}ms`,
    status,
    timestamp: new Date().toISOString()
  });
};

/**
 * 业务操作日志
 * @param {string} userId 用户ID
 * @param {string} action 操作类型
 * @param {string} resource 资源类型
 * @param {string} resourceId 资源ID
 * @param {Object} details 详细信息
 */
const businessLogger = (userId, action, resource, resourceId, details = {}) => {
  logger.info('Business Operation', {
    userId,
    action,
    resource,
    resourceId,
    details,
    timestamp: new Date().toISOString()
  });
};

/**
 * 安全事件日志
 * @param {string} event 事件类型
 * @param {string} ip IP 地址
 * @param {string} userAgent 用户代理
 * @param {Object} details 详细信息
 */
const securityLogger = (event, ip, userAgent, details = {}) => {
  logger.warn('Security Event', {
    event,
    ip,
    userAgent,
    details,
    timestamp: new Date().toISOString()
  });
};

/**
 * 性能监控日志
 * @param {string} operation 操作名称
 * @param {number} duration 执行时间
 * @param {Object} metrics 性能指标
 */
const performanceLogger = (operation, duration, metrics = {}) => {
  logger.info('Performance Metrics', {
    operation,
    duration: `${duration}ms`,
    metrics,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  logger,
  createChildLogger,
  httpLogger,
  dbLogger,
  aiLogger,
  businessLogger,
  securityLogger,
  performanceLogger,
  logBusinessOperation: businessLogger,
  logError: logger.error.bind(logger),
  logInfo: logger.info.bind(logger),
  logWarn: logger.warn.bind(logger),
  logDebug: logger.debug.bind(logger),
  // 便捷方法
  info: logger.info.bind(logger),
  error: logger.error.bind(logger),
  warn: logger.warn.bind(logger),
  debug: logger.debug.bind(logger),
  verbose: logger.verbose.bind(logger)
};