const logger = require('../utils/logger');

/**
 * 自定义错误类
 */
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 验证错误类
 */
class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400);
    this.errors = errors;
    this.name = 'ValidationError';
  }
}

/**
 * 认证错误类
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * 授权错误类
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * 资源未找到错误类
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * 冲突错误类
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * 速率限制错误类
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * 处理 Mongoose 验证错误
 */
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map(error => ({
    field: error.path,
    message: error.message,
    value: error.value
  }));
  
  return new ValidationError('Validation failed', errors);
};

/**
 * 处理 Mongoose 重复键错误
 */
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  
  return new ConflictError(`${field} '${value}' already exists`);
};

/**
 * 处理 Mongoose CastError
 */
const handleCastError = (err) => {
  return new ValidationError(`Invalid ${err.path}: ${err.value}`);
};

/**
 * 处理 JWT 错误
 */
const handleJWTError = () => {
  return new AuthenticationError('Invalid token');
};

/**
 * 处理 JWT 过期错误
 */
const handleJWTExpiredError = () => {
  return new AuthenticationError('Token has expired');
};

/**
 * 发送开发环境错误响应
 */
const sendErrorDev = (err, req, res) => {
  // API 错误
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    });
  }
  
  // 渲染错误页面（如果有前端路由）
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    timestamp: new Date().toISOString()
  });
};

/**
 * 发送生产环境错误响应
 */
const sendErrorProd = (err, req, res) => {
  // API 错误
  if (req.originalUrl.startsWith('/api')) {
    // 操作性错误：发送消息给客户端
    if (err.isOperational) {
      const response = {
        status: err.status,
        message: err.message,
        timestamp: new Date().toISOString()
      };
      
      // 如果是验证错误，包含详细错误信息
      if (err.name === 'ValidationError' && err.errors) {
        response.errors = err.errors;
      }
      
      return res.status(err.statusCode).json(response);
    }
    
    // 编程错误：不泄露错误详情
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong',
      timestamp: new Date().toISOString()
    });
  }
  
  // 渲染错误页面
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
  
  // 编程错误
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong',
    timestamp: new Date().toISOString()
  });
};

/**
 * 全局错误处理中间件
 */
const errorHandler = (err, req, res, _next) => {
  let error = { ...err };
  error.message = err.message;
  
  // 记录错误日志
  logger.logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Mongoose 验证错误
  if (err.name === 'ValidationError') {
    error = handleValidationError(err);
  }
  
  // Mongoose 重复键错误
  if (err.code === 11000) {
    error = handleDuplicateKeyError(err);
  }
  
  // Mongoose CastError
  if (err.name === 'CastError') {
    error = handleCastError(err);
  }
  
  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  }
  
  // JWT 过期错误
  if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }
  
  // 设置默认状态码
  error.statusCode = error.statusCode || 500;
  error.status = error.status || 'error';
  
  // 根据环境发送不同的错误响应
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

/**
 * 异步错误捕获包装器
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * 404 错误处理中间件
 */
const notFound = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * 创建错误响应
 */
const createErrorResponse = (message, statusCode = 500, errors = null) => {
  const response = {
    status: statusCode < 500 ? 'fail' : 'error',
    message,
    timestamp: new Date().toISOString()
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  return response;
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  errorHandler,
  catchAsync,
  notFound,
  createErrorResponse
};