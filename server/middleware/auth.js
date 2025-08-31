const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { securityLogger } = require('../utils/logger');

// 安全地导入Redis缓存
let cache = null;
try {
  const redisConfig = require('../config/redis');
  cache = redisConfig.cache;
} catch (error) {
  securityLogger.warn('Redis cache not available, continuing without cache');
}

/**
 * JWT 认证中间件
 */
const authMiddleware = async (req, res, next) => {
  try {
    // 从请求头获取 token
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : req.cookies?.token;

    if (!token) {
      securityLogger('AUTH_MISSING_TOKEN', req.ip, req.get('User-Agent'));
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    // 验证 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 检查 token 是否在黑名单中
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      securityLogger('AUTH_BLACKLISTED_TOKEN', req.ip, req.get('User-Agent'), { userId: decoded.userId });
      return res.status(401).json({
        error: 'Access denied',
        message: 'Token has been revoked'
      });
    }

    // 从缓存或数据库获取用户信息
    let user = null;
    if (cache) {
      user = await cache.get(`user:${decoded.userId}`);
    }
    
    if (!user) {
      user = await User.findById(decoded.userId).select('-password');
      if (!user) {
        securityLogger('AUTH_USER_NOT_FOUND', req.ip, req.get('User-Agent'), { userId: decoded.userId });
        return res.status(401).json({
          error: 'Access denied',
          message: 'User not found'
        });
      }
      // 缓存用户信息 15 分钟（如果缓存可用）
      if (cache) {
        await cache.set(`user:${decoded.userId}`, user, 900);
      }
    }

    // 检查用户状态
    if (!user.isActive) {
      securityLogger('AUTH_INACTIVE_USER', req.ip, req.get('User-Agent'), { userId: user._id });
      return res.status(401).json({
        error: 'Access denied',
        message: 'Account is inactive'
      });
    }

    // 将用户信息添加到请求对象
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    securityLogger('AUTH_TOKEN_INVALID', req.ip, req.get('User-Agent'), { error: error.message });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Token has expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid token'
      });
    }
    
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
};

/**
 * 可选认证中间件（不强制要求认证）
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : req.cookies?.token;

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (user && user.isActive) {
        req.user = user;
        req.token = token;
      }
    }
    
    next();
  } catch (error) {
    // 可选认证失败时不阻止请求继续
    next();
  }
};

/**
 * 角色权限检查中间件
 * @param {string|Array} roles 允许的角色
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Authentication required'
      });
    }

    const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.role];
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    const hasPermission = allowedRoles.some(role => userRoles.includes(role));
    
    if (!hasPermission) {
      securityLogger('AUTH_INSUFFICIENT_PERMISSIONS', req.ip, req.get('User-Agent'), {
        userId: req.user._id,
        userRoles,
        requiredRoles: allowedRoles
      });
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

/**
 * 权限检查中间件
 * @param {string|Array} permissions 需要的权限
 */
const requirePermission = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Authentication required'
      });
    }

    const userPermissions = req.user.permissions || [];
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    
    const hasPermission = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
    
    if (!hasPermission) {
      securityLogger('AUTH_INSUFFICIENT_PERMISSIONS', req.ip, req.get('User-Agent'), {
        userId: req.user._id,
        userPermissions,
        requiredPermissions
      });
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

/**
 * 资源所有者检查中间件
 * @param {string} resourceField 资源字段名（如 'userId'）
 */
const requireOwnership = (resourceField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Authentication required'
      });
    }

    // 管理员可以访问所有资源
    if (req.user.role === 'admin' || req.user.roles?.includes('admin')) {
      return next();
    }

    // 检查资源所有权
    const resourceUserId = req.params[resourceField] || req.body[resourceField] || req.query[resourceField];
    
    if (resourceUserId && resourceUserId !== req.user._id.toString()) {
      securityLogger('AUTH_OWNERSHIP_VIOLATION', req.ip, req.get('User-Agent'), {
        userId: req.user._id,
        resourceUserId,
        resourceField
      });
      
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only access your own resources'
      });
    }
    
    next();
  };
};

/**
 * API 密钥认证中间件
 */
const apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'API key required'
      });
    }

    // 验证 API 密钥
    const user = await User.findOne({ apiKey, isActive: true }).select('-password');
    
    if (!user) {
      securityLogger('AUTH_INVALID_API_KEY', req.ip, req.get('User-Agent'));
      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid API key'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(500).json({
      error: 'Internal server error',
      message: 'API key authentication failed'
    });
  }
};

/**
 * 速率限制中间件（基于用户）
 * @param {number} maxRequests 最大请求数
 * @param {number} windowMs 时间窗口（毫秒）
 */
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const key = `rate_limit:${req.user._id}:${Math.floor(Date.now() / windowMs)}`;
    
    try {
      if (!cache) {
        // 如果缓存不可用，跳过速率限制
        return next();
      }
      
      const current = await cache.get(key) || 0;
      
      if (current >= maxRequests) {
        securityLogger('AUTH_RATE_LIMIT_EXCEEDED', req.ip, req.get('User-Agent'), {
          userId: req.user._id,
          requests: current,
          limit: maxRequests
        });
        
        return res.status(429).json({
          error: 'Too many requests',
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
      
      await cache.set(key, current + 1, Math.ceil(windowMs / 1000));
      next();
    } catch (error) {
      // 如果缓存失败，允许请求继续
      next();
    }
  };
};

module.exports = {
  authMiddleware,
  optionalAuth,
  requireRole,
  requirePermission,
  requireOwnership,
  apiKeyAuth,
  userRateLimit
};