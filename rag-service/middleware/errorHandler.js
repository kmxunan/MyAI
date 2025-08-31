const logger = require('../utils/logger');
const {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  VectorDBError,
  EmbeddingError,
  DocumentProcessingError,
} = require('../utils/errors');

/**
 * Handle different types of errors
 */
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new ValidationError(message, err.path);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new ConflictError(message);
};

const handleValidationErrorDB = (err) => {
  const errors = err.errors && typeof err.errors === 'object'
    ? Object.values(err.errors).map((el) => el.message || el)
    : [err.message || 'Validation failed'];
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new ValidationError(message);
};

const handleJWTError = () => new AuthenticationError('Invalid token. Please log in again!');

const handleJWTExpiredError = () => new AuthenticationError('Your token has expired! Please log in again.');

const handleMulterError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new ValidationError('File too large');
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return new ValidationError('Too many files');
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new ValidationError('Unexpected file field');
  }
  return new ValidationError('File upload error');
};

/**
 * Send error response in development
 */
const sendErrorDev = (err, req, res) => {
  // Log error details
  logger.logError('Development Error', err, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
  });

  res.status(err.statusCode).json({
    status: 'error',
    error: err,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Send error response in production
 */
const sendErrorProd = (err, req, res) => {
  // Log error details
  logger.logError('Production Error', err, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    isOperational: err.isOperational,
  });

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Programming or other unknown error: don't leak error details
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, _next) => {
  const error = err;
  error.statusCode = error.statusCode || 500;
  error.status = error.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    let processedError = { ...error };
    processedError.message = error.message;
    processedError.name = error.name;

    // Handle specific error types
    if (processedError.name === 'CastError') processedError = handleCastErrorDB(processedError);
    if (processedError.code === 11000) processedError = handleDuplicateFieldsDB(processedError);
    if (processedError.name === 'ValidationError') processedError = handleValidationErrorDB(processedError);
    if (processedError.name === 'JsonWebTokenError') processedError = handleJWTError();
    if (processedError.name === 'TokenExpiredError') processedError = handleJWTExpiredError();
    if (processedError.name === 'MulterError') processedError = handleMulterError(processedError);

    sendErrorProd(processedError, req, res);
  }
};

/**
 * Async error wrapper
 * Catches async errors and passes them to the error handler
 */
const catchAsync = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

/**
 * 404 error handler
 */
const notFound = (req, res, next) => {
  const err = new NotFoundError(`Route ${req.originalUrl}`);
  next(err);
};

/**
 * Validation error helper
 */
const createValidationError = (message, field = null) => new ValidationError(message, field);

/**
 * RAG-specific error handlers
 */
const handleVectorDBError = (operation, error) => {
  logger.logVector('Vector DB Error', 'unknown', {
    operation,
    error: error.message,
    stack: error.stack,
  });

  return new VectorDBError(`Vector database ${operation} failed: ${error.message}`);
};

const handleEmbeddingError = (model, error) => {
  logger.logEmbedding('Embedding Error', model, 0, {
    error: error.message,
    stack: error.stack,
  });

  return new EmbeddingError(`Embedding generation failed with ${model}: ${error.message}`);
};

const handleDocumentProcessingError = (filename, error) => {
  logger.logRAG('Document Processing Error', {
    filename,
    error: error.message,
    stack: error.stack,
  });

  return new DocumentProcessingError(`Failed to process document ${filename}: ${error.message}`);
};

/**
 * Rate limiting error handler
 */
const handleRateLimitError = (req, res, next) => {
  logger.logSecurity('Rate limit exceeded', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    path: req.path,
    userId: req.user?.id,
  });

  const error = new RateLimitError('Too many requests from this IP, please try again later.');
  next(error);
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  VectorDBError,
  EmbeddingError,
  DocumentProcessingError,

  // Error handlers
  errorHandler,
  catchAsync,
  notFound,
  createValidationError,

  // RAG-specific error handlers
  handleVectorDBError,
  handleEmbeddingError,
  handleDocumentProcessingError,
  handleRateLimitError,
};
