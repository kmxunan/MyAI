const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');

/**
 * Authentication middleware
 * Verifies JWT token and sets user information in request
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.logSecurity('Missing or invalid authorization header', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });

      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided or invalid format',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided',
      });
    }

    // Check if token is blacklisted
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      logger.logSecurity('Blacklisted token used', {
        token: `${token.substring(0, 20)}...`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      return res.status(401).json({
        error: 'Access denied',
        message: 'Token has been revoked',
      });
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Authentication service not properly configured',
      });
    }

    const decoded = jwt.verify(token, jwtSecret);

    // Check if user exists in cache
    let user = await cache.get(`user:${decoded.userId}`);

    if (!user) {
      // If not in cache, we could fetch from main database
      // For now, we'll use the token payload
      user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role || 'user',
        permissions: decoded.permissions || [],
      };

      // Cache user for 1 hour
      await cache.set(`user:${decoded.userId}`, user, 3600);
    }

    // Check if user is active
    if (user.status === 'inactive' || user.status === 'suspended') {
      logger.logSecurity('Inactive user attempted access', {
        userId: user.id,
        status: user.status,
        ip: req.ip,
      });

      return res.status(403).json({
        error: 'Access denied',
        message: 'Account is not active',
      });
    }

    // Add user info to request
    req.user = user;
    req.token = token;

    // Log successful authentication
    logger.logSecurity('User authenticated', {
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: req.ip,
      path: req.path,
    });

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logger.logSecurity('Invalid JWT token', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      logger.logSecurity('Expired JWT token', {
        expiredAt: error.expiredAt,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      return res.status(401).json({
        error: 'Access denied',
        message: 'Token has expired',
      });
    }

    logger.logError('Authentication middleware error', error, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication service error',
    });
  }
};

/**
 * Role-based authorization middleware
 * @param {Array|string} allowedRoles - Roles that are allowed to access the route
 */
const authorize = (allowedRoles) => (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Authentication required',
      });
    }

    const userRole = req.user.role;
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(userRole)) {
      logger.logSecurity('Unauthorized access attempt', {
        userId: req.user.id,
        userRole,
        requiredRoles: roles,
        path: req.path,
        ip: req.ip,
      });

      return res.status(403).json({
        error: 'Access denied',
        message: 'Insufficient permissions',
      });
    }

    next();
  } catch (error) {
    logger.logError('Authorization middleware error', error, {
      userId: req.user?.id,
      path: req.path,
      ip: req.ip,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Authorization service error',
    });
  }
};

/**
 * Permission-based authorization middleware
 * @param {Array|string} requiredPermissions - Permissions required to access the route
 */
const requirePermissions = (requiredPermissions) => (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Authentication required',
      });
    }

    const userPermissions = req.user.permissions || [];
    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

    const hasPermission = permissions.every(
      (permission) => userPermissions.includes(permission) || userPermissions.includes('*'),
    );

    if (!hasPermission) {
      logger.logSecurity('Insufficient permissions', {
        userId: req.user.id,
        userPermissions,
        requiredPermissions: permissions,
        path: req.path,
        ip: req.ip,
      });

      return res.status(403).json({
        error: 'Access denied',
        message: 'Insufficient permissions',
      });
    }

    next();
  } catch (error) {
    logger.logError('Permission middleware error', error, {
      userId: req.user?.id,
      path: req.path,
      ip: req.ip,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Permission service error',
    });
  }
};

/**
 * Optional authentication middleware
 * Sets user info if token is provided, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    if (!token) {
      return next();
    }

    // Check if token is blacklisted
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return next();
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return next();
    }

    const decoded = jwt.verify(token, jwtSecret);

    // Get user from cache
    let user = await cache.get(`user:${decoded.userId}`);

    if (!user) {
      user = {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role || 'user',
        permissions: decoded.permissions || [],
      };

      await cache.set(`user:${decoded.userId}`, user, 3600);
    }

    if (user.status !== 'inactive' && user.status !== 'suspended') {
      req.user = user;
      req.token = token;
    }

    next();
  } catch (error) {
    // Silently continue without authentication
    next();
  }
};

module.exports = {
  authMiddleware,
  authorize,
  requirePermissions,
  optionalAuth,
};
