const express = require('express');
const { healthCheck: dbHealthCheck } = require('../config/database');
const { healthCheck: redisHealthCheck } = require('../config/redis');
const logger = require('../utils/logger');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check the health status of the RAG service and its dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 message:
 *                   type: string
 *                   example: RAG service is running
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 uptime:
 *                   type: number
 *                   description: Service uptime in seconds
 *                 dependencies:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         message:
 *                           type: string
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         message:
 *                           type: string
 *       503:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: unhealthy
 *                 message:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/', catchAsync(async (req, res) => {
  const startTime = Date.now();

  try {
    // Check dependencies
    const [dbHealth, redisHealth] = await Promise.all([
      dbHealthCheck(),
      redisHealthCheck(),
    ]);

    const dependencies = {
      database: dbHealth,
      redis: redisHealth,
    };

    // Determine overall health
    const isHealthy = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';
    const status = isHealthy ? 'healthy' : 'unhealthy';
    const statusCode = isHealthy ? 200 : 503;

    const response = {
      status,
      message: isHealthy ? 'RAG service is running' : 'RAG service has issues',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor(process.uptime()),
      responseTime: `${Date.now() - startTime}ms`,
      dependencies,
      environment: process.env.NODE_ENV || 'development',
    };

    // Log health check
    if (isHealthy) {
      logger.logRAG('Health check passed', {
        responseTime: response.responseTime,
        uptime: response.uptime,
      });
    } else {
      logger.logRAG('Health check failed', {
        dependencies,
        responseTime: response.responseTime,
      });
    }

    res.status(statusCode).json(response);
  } catch (error) {
    logger.logError('Health check error', error);

    res.status(503).json({
      status: 'unhealthy',
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - startTime}ms`,
    });
  }
}));

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Detailed health check
 *     description: Get detailed health information including system metrics
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 system:
 *                   type: object
 *                   properties:
 *                     memory:
 *                       type: object
 *                     cpu:
 *                       type: object
 *                     platform:
 *                       type: string
 *                     nodeVersion:
 *                       type: string
 */
router.get('/detailed', catchAsync(async (req, res) => {
  const startTime = Date.now();

  try {
    // Get system information
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Check dependencies with detailed info
    const [dbHealth, redisHealth] = await Promise.all([
      dbHealthCheck(),
      redisHealthCheck(),
    ]);

    const response = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor(process.uptime()),
      responseTime: `${Date.now() - startTime}ms`,
      system: {
        memory: {
          rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
          heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
          external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid,
      },
      dependencies: {
        database: dbHealth,
        redis: redisHealth,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: process.env.RAG_PORT || 3002,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    logger.logRAG('Detailed health check', {
      memoryUsage: response.system.memory,
      uptime: response.uptime,
      responseTime: response.responseTime,
    });

    res.json(response);
  } catch (error) {
    logger.logError('Detailed health check error', error);

    res.status(503).json({
      status: 'unhealthy',
      message: 'Detailed health check failed',
      error: error.message,
      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - startTime}ms`,
    });
  }
}));

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe
 *     description: Check if the service is ready to accept requests
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', catchAsync(async (req, res) => {
  try {
    // Check if all critical dependencies are available
    const [dbHealth, redisHealth] = await Promise.all([
      dbHealthCheck(),
      redisHealthCheck(),
    ]);

    const isReady = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';

    if (isReady) {
      res.json({
        status: 'ready',
        message: 'Service is ready to accept requests',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        message: 'Service is not ready to accept requests',
        dependencies: {
          database: dbHealth,
          redis: redisHealth,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.logError('Readiness check error', error);

    res.status(503).json({
      status: 'not ready',
      message: 'Readiness check failed',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}));

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness probe
 *     description: Check if the service is alive
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    message: 'Service is alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

module.exports = router;
