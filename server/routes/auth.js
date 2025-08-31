const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authMiddleware: authenticateToken } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const loggerModule = require('../utils/logger');
const redis = require('../config/redis');

// Redis 安全包装函数
const safeRedisOperation = async (operation) => {
  try {
    if (!redis || typeof redis[operation.method] !== 'function') {
      loggerModule.warn(`Redis not available, skipping ${operation.method} operation`);
      return null;
    }
    return await redis[operation.method](...operation.args);
  } catch (error) {
    loggerModule.warn(`Redis operation ${operation.method} failed:`, error.message);
    return null;
  }
};

const router = express.Router();

// 速率限制配置
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 最多5次尝试
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip + ':' + (req.body.email || req.body.username || 'unknown');
  }
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 3, // 最多3次密码重置请求
  message: {
    error: 'Too many password reset attempts, please try again later.',
    retryAfter: 60 * 60
  }
});

// 验证规则
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number and special character'),
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .trim()
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .trim()
    .withMessage('Last name cannot exceed 50 characters')
];

const loginValidation = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or username is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const passwordResetValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
];

const passwordUpdateValidation = [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number and special character')
];

// 工具函数
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  
  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  
  return { accessToken, refreshToken };
};

const setTokenCookies = (res, tokens) => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };
  
  res.cookie('accessToken', tokens.accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000 // 15分钟
  });
  
  res.cookie('refreshToken', tokens.refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7天
  });
};

const clearTokenCookies = (res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
};

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               firstName:
 *                 type: string
 *                 maxLength: 50
 *               lastName:
 *                 type: string
 *                 maxLength: 50
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error or user already exists
 *       429:
 *         description: Too many requests
 */
router.post('/register', authLimiter, registerValidation, catchAsync(async (req, res) => {
  // 验证输入
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  
  const { username, email, password, firstName, lastName } = req.body;
  
  // 检查用户是否已存在
  const existingUser = await User.findByEmailOrUsername(email);
  if (existingUser) {
    loggerModule.securityLogger('registration_attempt_duplicate', req.ip, req.get('User-Agent'), {
      email,
      username,
      ip: req.ip
    });
    
    return res.status(400).json({
      success: false,
      message: 'User with this email or username already exists'
    });
  }
  
  // 创建新用户
  const user = new User({
    username,
    email,
    password,
    firstName,
    lastName,
    permissions: ['chat:read', 'chat:write'] // 默认权限
  });
  
  await user.save();
  
  // 生成邮箱验证令牌
  user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });
  
  // 生成JWT令牌
  const tokens = generateTokens(user._id);
  
  // 设置Cookie
  setTokenCookies(res, tokens);
  
  // 存储刷新令牌到Redis
  await safeRedisOperation({
    method: 'setWithExpiry',
    args: [`refresh_token:${user._id}`, tokens.refreshToken, 7 * 24 * 60 * 60]
  });
  
  loggerModule.businessLogger(user._id, 'user_registered', 'user', user._id, {
    userId: user._id,
    username,
    email,
    ip: req.ip
  });
  
  // TODO: 发送验证邮件
  // await sendVerificationEmail(user.email, verificationToken);
  
  res.status(201).json({
    success: true,
    message: 'User registered successfully. Please check your email for verification.',
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      },
      tokens
    }
  });
}));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - password
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email or username
 *               password:
 *                 type: string
 *               rememberMe:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked
 *       429:
 *         description: Too many requests
 */
router.post('/login', authLimiter, loginValidation, catchAsync(async (req, res) => {
  // 验证输入
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  
  const { identifier, password, rememberMe = false } = req.body;
  
  // 查找用户
  const user = await User.findByEmailOrUsername(identifier).select('+password');
  
  if (!user) {
    loggerModule.securityLogger('login_attempt_invalid_user', req.ip, req.get('User-Agent'), {
      identifier,
      ip: req.ip
    });
    
    return res.status(400).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
  
  // 检查账户是否被锁定
  if (user.isLocked) {
    loggerModule.securityLogger('login_attempt_locked_account', req.ip, req.get('User-Agent'), {
      userId: user._id,
      identifier,
      ip: req.ip
    });
    
    return res.status(423).json({
      success: false,
      message: 'Account is temporarily locked due to too many failed login attempts',
      lockUntil: user.lockUntil
    });
  }
  
  // 检查账户是否激活
  if (!user.isActive) {
    return res.status(400).json({
      success: false,
      message: 'Account is deactivated. Please contact support.'
    });
  }
  
  // 验证密码
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    // 增加登录尝试次数
    await user.incLoginAttempts();
    
    loggerModule.securityLogger('login_attempt_invalid_password', req.ip, req.get('User-Agent'), {
      userId: user._id,
      identifier,
      ip: req.ip,
      attempts: user.loginAttempts + 1
    });
    
    return res.status(400).json({
      success: false,
      message: 'Invalid credentials'
    });
  }
  
  // 重置登录尝试次数
  if (user.loginAttempts > 0) {
    await user.resetLoginAttempts();
  }
  
  // 更新登录信息
  user.lastLogin = new Date();
  user.loginCount += 1;
  await user.save();
  
  // 生成JWT令牌
  const tokens = generateTokens(user._id);
  
  // 设置Cookie
  setTokenCookies(res, tokens);
  
  // 存储刷新令牌到Redis
  const refreshTokenExpiry = rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60; // 30天或7天
  await safeRedisOperation({
    method: 'setWithExpiry',
    args: [`refresh_token:${user._id}`, tokens.refreshToken, refreshTokenExpiry]
  });
  
  loggerModule.businessLogger(user._id, 'user_logged_in', 'user', user._id, {
    userId: user._id,
    username: user.username,
    ip: req.ip,
    rememberMe
  });
  
  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        roles: user.roles,
        permissions: user.permissions,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        preferences: user.preferences
      },
      tokens
    }
  });
}));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', authenticateToken, catchAsync(async (req, res) => {
  const userId = req.user.id;
  
  // 从Redis中删除刷新令牌
  await safeRedisOperation({
    method: 'del',
    args: [`refresh_token:${userId}`]
  });
  
  // 清除Cookie
  clearTokenCookies(res);
  
  loggerModule.businessLogger(userId, 'user_logged_out', 'user', userId, {
    userId,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', catchAsync(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token is required'
    });
  }
  
  try {
    // 验证刷新令牌
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    // 检查Redis中的令牌
    const storedToken = await safeRedisOperation({
      method: 'get',
      args: [`refresh_token:${decoded.userId}`]
    });
    if (storedToken !== refreshToken) {
      throw new Error('Token not found or expired');
    }
    
    // 查找用户
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }
    
    // 生成新的令牌
    const tokens = generateTokens(user._id);
    
    // 设置Cookie
    setTokenCookies(res, tokens);
    
    // 更新Redis中的刷新令牌
    await safeRedisOperation({
      method: 'setWithExpiry',
      args: [`refresh_token:${user._id}`, tokens.refreshToken, 7 * 24 * 60 * 60]
    });
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        tokens
      }
    });
    
  } catch (error) {
    loggerModule.securityLogger('refresh_token_invalid', req.ip, req.get('User-Agent'), {
      error: error.message,
      ip: req.ip
    });
    
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token'
    });
  }
}));

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       404:
 *         description: User not found
 *       429:
 *         description: Too many requests
 */
router.post('/forgot-password', passwordResetLimiter, passwordResetValidation, catchAsync(async (req, res) => {
  // 验证输入
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  
  const { email } = req.body;
  
  // 查找用户
  const user = await User.findOne({ email });
  
  if (!user) {
    // 为了安全，即使用户不存在也返回成功消息
    return res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  }
  
  // 生成重置令牌
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  
  loggerModule.securityLogger('password_reset_requested', req.ip, req.get('User-Agent'), {
    userId: user._id,
    email,
    ip: req.ip
  });
  
  // TODO: 发送密码重置邮件
  // await sendPasswordResetEmail(user.email, resetToken);
  
  res.json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
    // 开发环境下返回令牌（生产环境应删除）
    ...(process.env.NODE_ENV === 'development' && { resetToken })
  });
}));

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password', passwordUpdateValidation, catchAsync(async (req, res) => {
  // 验证输入
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  
  const { token, password } = req.body;
  
  // 哈希令牌
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  // 查找用户
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }
  
  // 更新密码
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = new Date();
  
  await user.save();
  
  // 清除所有刷新令牌
  await safeRedisOperation({
    method: 'del',
    args: [`refresh_token:${user._id}`]
  });
  
  loggerModule.securityLogger('password_reset_completed', req.ip, req.get('User-Agent'), {
    userId: user._id,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Password reset successful. Please login with your new password.'
  });
}));

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email address
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post('/verify-email', catchAsync(async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Verification token is required'
    });
  }
  
  // 哈希令牌
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  // 查找用户
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired verification token'
    });
  }
  
  // 验证邮箱
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  
  await user.save();
  
  loggerModule.businessLogger(user._id, 'email_verified', 'user', user._id, {
    userId: user._id,
    email: user.email,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Email verified successfully'
  });
}));

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticateToken, catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        avatar: user.avatar,
        phone: user.phone,
        role: user.role,
        roles: user.roles,
        permissions: user.permissions,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        loginCount: user.loginCount,
        preferences: user.preferences,
        subscription: user.subscription,
        aiUsage: user.aiUsage,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    }
  });
}));

/**
 * @swagger
 * /api/auth/validate:
 *   get:
 *     summary: Validate token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Token is invalid
 */
router.get('/validate', authenticateToken, catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
      valid: false
    });
  }

  res.json({
    success: true,
    message: 'Token is valid',
    valid: true,
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        role: user.role,
        roles: user.roles,
        permissions: user.permissions,
        isEmailVerified: user.isEmailVerified,
        lastLogin: user.lastLogin,
        preferences: user.preferences
      }
    }
  });
}));

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 */
router.post('/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must be at least 8 characters with uppercase, lowercase, number and special character')
], catchAsync(async (req, res) => {
  // 验证输入
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  
  const { currentPassword, newPassword } = req.body;
  
  // 获取用户（包含密码）
  const user = await User.findById(req.user.id).select('+password');
  
  // 验证当前密码
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }
  
  // 更新密码
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();
  
  // 清除所有刷新令牌（强制重新登录）
  await safeRedisOperation({
    method: 'del',
    args: [`refresh_token:${user._id}`]
  });
  
  loggerModule.securityLogger('password_changed', req.ip, req.get('User-Agent'), {
    userId: user._id,
    ip: req.ip
  });
  
  res.json({
    success: true,
    message: 'Password changed successfully. Please login again.'
  });
}));

module.exports = router;