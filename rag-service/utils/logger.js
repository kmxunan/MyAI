const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? `\n${info.stack}` : ''}`,
  ),
);

// Define format for file logs (without colors)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
const fs = require('fs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format,
    level: level(),
  }),

  // Error log file
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),

  // Combined log file
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
];

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format: fileFormat,
  transports,
  exitOnError: false,
});

// Handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new winston.transports.File({
    filename: path.join(logsDir, 'exceptions.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
);

logger.rejections.handle(
  new winston.transports.File({
    filename: path.join(logsDir, 'rejections.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
);

// Add request logging method
logger.logRequest = (req, res, responseTime) => {
  const {
    method,
    url,
    ip,
    headers,
  } = req;
  const { statusCode } = res;
  const userAgent = headers['user-agent'] || 'Unknown';

  const logData = {
    method,
    url,
    statusCode,
    responseTime: `${responseTime}ms`,
    ip,
    userAgent,
    timestamp: new Date().toISOString(),
  };

  if (statusCode >= 400) {
    logger.error('HTTP Request Error', logData);
  } else {
    logger.http('HTTP Request', logData);
  }
};

// Add structured logging methods
logger.logError = (message, error, context = {}) => {
  const errorData = {
    error: {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    },
    context,
    timestamp: new Date().toISOString(),
  };

  logger.error(message, errorData);
};

logger.logInfo = (message, data = {}) => {
  const logData = {
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  logger.info(message, logData);
};

logger.logDebug = (message, data = {}) => {
  const logData = {
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  logger.debug(message, logData);
};

// Add performance logging
logger.logPerformance = (operation, duration, metadata = {}) => {
  const perfData = {
    operation,
    duration: `${duration}ms`,
    metadata,
    timestamp: new Date().toISOString(),
  };

  if (duration > 1000) {
    logger.warn('Slow Operation', perfData);
  } else {
    logger.info('Performance', perfData);
  }
};

// Add security logging
logger.logSecurity = (event, details = {}) => {
  const securityData = {
    event,
    details,
    timestamp: new Date().toISOString(),
    severity: 'security',
  };

  logger.warn('Security Event', securityData);
};

// Add business logic logging
logger.logBusiness = (action, userId, details = {}) => {
  const businessData = {
    action,
    userId,
    details,
    timestamp: new Date().toISOString(),
  };

  logger.info('Business Action', businessData);
};

// Add RAG-specific logging
logger.logRAG = (operation, details = {}) => {
  const ragData = {
    operation,
    details,
    timestamp: new Date().toISOString(),
    service: 'rag',
  };

  logger.info('RAG Operation', ragData);
};

// Add vector database logging
logger.logVector = (operation, collection, details = {}) => {
  const vectorData = {
    operation,
    collection,
    details,
    timestamp: new Date().toISOString(),
    service: 'vector-db',
  };

  logger.info('Vector DB Operation', vectorData);
};

// Add embedding logging
logger.logEmbedding = (operation, model, tokenCount, details = {}) => {
  const embeddingData = {
    operation,
    model,
    tokenCount,
    details,
    timestamp: new Date().toISOString(),
    service: 'embedding',
  };

  logger.info('Embedding Operation', embeddingData);
};

module.exports = logger;
