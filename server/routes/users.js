const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, query, param, validationResult } = require('express-validator');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { authMiddleware: authenticateToken, requireRole: checkRole } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const redis = require('../config/redis');

// Redis 安全包装函数
const safeRedisOperation = async (operation) => {
  try {
    if (!redis || typeof redis[operation.method] !== 'function') {
      logger.warn(`Redis not available, skipping ${operation.method} operation`);
      return null;
    }
    return await redis[operation.method](...operation.args);
  } catch (error) {
    logger.warn(`Redis operation ${operation.method} failed:`, error.message);
    return null;
  }
};

const router = express.Router();

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads/avatars'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `avatar-${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// 验证规则
const updateProfileValidation = [
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .trim()
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .trim()
    .withMessage('Last name cannot exceed 50 characters'),
  body('phone')
    .optional()
    .matches(/^[+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid phone number'),
  body('preferences.language')
    .optional()
    .isIn(['en', 'zh', 'zh-CN', 'zh-TW'])
    .withMessage('Invalid language'),
  body('preferences.theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Invalid theme'),
  body('preferences.timezone')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Invalid timezone')
];

const updateNotificationValidation = [
  body('notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notification must be a boolean'),
  body('notifications.push')
    .optional()
    .isBoolean()
    .withMessage('Push notification must be a boolean'),
  body('notifications.sms')
    .optional()
    .isBoolean()
    .withMessage('SMS notification must be a boolean')
];

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 */
router.get('/profile', authenticateToken, catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }
  
  res.json({
    success: true,
    data: {
      user
    }
  });
}));

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 maxLength: 50
 *               lastName:
 *                 type: string
 *                 maxLength: 50
 *               phone:
 *                 type: string
 *               preferences:
 *                 type: object
 *                 properties:
 *                   language:
 *                     type: string
 *                     enum: [en, zh, zh-CN, zh-TW]
 *                   theme:
 *                     type: string
 *                     enum: [light, dark, auto]
 *                   timezone:
 *                     type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.put('/profile',
  authenticateToken,
  updateProfileValidation,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const userId = req.user.id;
    const updates = req.body;
    
    // 处理嵌套的preferences更新
    if (updates.preferences) {
      const user = await User.findById(userId);
      updates.preferences = {
        ...user.preferences.toObject(),
        ...updates.preferences
      };
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');
    
    logger.logBusinessOperation('profile_updated', {
      userId,
      updates: Object.keys(updates)
    });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user
      }
    });
  })
);

/**
 * @swagger
 * /api/users/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 */
router.post('/avatar',
  authenticateToken,
  upload.single('avatar'),
  catchAsync(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    const userId = req.user.id;
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true }
    ).select('-password');
    
    logger.logBusinessOperation('avatar_updated', {
      userId,
      filename: req.file.filename
    });
    
    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatarUrl,
        user
      }
    });
  })
);

/**
 * @swagger
 * /api/users/notifications:
 *   put:
 *     summary: Update notification preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notifications:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: boolean
 *                   push:
 *                     type: boolean
 *                   sms:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Notification preferences updated successfully
 */
router.put('/notifications',
  authenticateToken,
  updateNotificationValidation,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const userId = req.user.id;
    const { notifications } = req.body;
    
    const user = await User.findById(userId);
    user.preferences.notifications = {
      ...user.preferences.notifications.toObject(),
      ...notifications
    };
    
    await user.save();
    
    logger.logBusinessOperation('notifications_updated', {
      userId,
      notifications
    });
    
    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      data: {
        notifications: user.preferences.notifications
      }
    });
  })
);

/**
 * @swagger
 * /api/users/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Time range in days
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
 */
router.get('/stats',
  authenticateToken,
  [
    query('timeRange').optional().isInt({ min: 1, max: 365 }).toInt()
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const userId = req.user.id;
    const { timeRange = 30 } = req.query;
    const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
    
    // 获取用户基本信息
    const user = await User.findById(userId).select('aiUsage subscription createdAt');
    
    // 获取对话统计
    const conversationStats = await Conversation.aggregate([
      {
        $match: {
          user: user._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalConversations: { $sum: 1 },
          conversationsByType: {
            $push: {
              type: '$type',
              count: 1
            }
          },
          totalTokens: { $sum: '$stats.totalTokens' },
          totalCost: { $sum: '$stats.totalCost' }
        }
      }
    ]);
    
    // 获取消息统计
    const messageStats = await Message.getUserStats(userId, timeRange);
    
    // 获取每日活动统计
    const dailyActivity = await Message.aggregate([
      {
        $match: {
          user: user._id,
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          messageCount: { $sum: 1 },
          tokenCount: { $sum: '$tokens.total' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    const stats = {
      user: {
        aiUsage: user.aiUsage,
        subscription: user.subscription,
        memberSince: user.createdAt
      },
      conversations: conversationStats[0] || {
        totalConversations: 0,
        conversationsByType: [],
        totalTokens: 0,
        totalCost: 0
      },
      messages: messageStats,
      dailyActivity,
      timeRange
    };
    
    res.json({
      success: true,
      data: {
        stats
      }
    });
  })
);

/**
 * @swagger
 * /api/users/api-key:
 *   post:
 *     summary: Regenerate API key
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key regenerated successfully
 */
router.post('/api-key',
  authenticateToken,
  catchAsync(async (req, res) => {
    const userId = req.user.id;
    const { v4: uuidv4 } = require('uuid');
    
    const newApiKey = `myai_${uuidv4().replace(/-/g, '')}`;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { apiKey: newApiKey },
      { new: true }
    ).select('apiKey');
    
    logger.logSecurityEvent('api_key_regenerated', {
      userId,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: 'API key regenerated successfully',
      data: {
        apiKey: user.apiKey
      }
    });
  })
);

/**
 * @swagger
 * /api/users/export:
 *   get:
 *     summary: Export user data
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User data exported successfully
 */
router.get('/export',
  authenticateToken,
  catchAsync(async (req, res) => {
    const userId = req.user.id;
    
    // 获取用户数据
    const user = await User.findById(userId).select('-password').lean();
    
    // 获取对话数据
    const conversations = await Conversation.find({
      user: userId,
      deletedAt: { $exists: false }
    }).lean();
    
    // 获取消息数据
    const messages = await Message.find({
      user: userId,
      deletedAt: { $exists: false }
    }).lean();
    
    const exportData = {
      user,
      conversations,
      messages,
      exportedAt: new Date(),
      version: '1.0'
    };
    
    logger.logBusinessOperation('data_exported', {
      userId,
      conversationCount: conversations.length,
      messageCount: messages.length
    });
    
    res.json({
      success: true,
      data: exportData
    });
  })
);

/**
 * @swagger
 * /api/users/delete-account:
 *   delete:
 *     summary: Delete user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - confirmation
 *             properties:
 *               password:
 *                 type: string
 *               confirmation:
 *                 type: string
 *                 enum: ['DELETE_MY_ACCOUNT']
 *     responses:
 *       200:
 *         description: Account deleted successfully
 */
router.delete('/delete-account',
  authenticateToken,
  [
    body('password').notEmpty().withMessage('Password is required'),
    body('confirmation').equals('DELETE_MY_ACCOUNT').withMessage('Please type DELETE_MY_ACCOUNT to confirm')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const userId = req.user.id;
    const { password } = req.body;
    
    // 验证密码
    const user = await User.findById(userId).select('+password');
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // 软删除用户数据
    await User.findByIdAndUpdate(userId, {
      isActive: false,
      deletedAt: new Date(),
      email: `deleted_${Date.now()}_${user.email}`,
      username: `deleted_${Date.now()}_${user.username}`
    });
    
    // 软删除对话
    await Conversation.updateMany(
      { user: userId },
      { status: 'deleted', deletedAt: new Date() }
    );
    
    // 软删除消息
    await Message.updateMany(
      { user: userId },
      { status: 'deleted', deletedAt: new Date() }
    );
    
    // 清除Redis中的数据
    await safeRedisOperation({
      method: 'del',
      args: [`refresh_token:${userId}`]
    });
    
    logger.logSecurityEvent('account_deleted', {
      userId,
      email: user.email,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  })
);

// 管理员路由
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [user, admin, moderator, business_user]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       403:
 *         description: Access denied
 */
router.get('/',
  authenticateToken,
  checkRole('admin'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('role').optional().isIn(['user', 'admin', 'moderator', 'business_user']),
    query('status').optional().isIn(['active', 'inactive'])
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { page = 1, limit = 20, role, status } = req.query;
    const skip = (page - 1) * limit;
    
    const query = {};
    if (role) query.role = role;
    if (status) query.isActive = status === 'active';
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
);

/**
 * @swagger
 * /api/users/{id}/role:
 *   put:
 *     summary: Update user role (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, admin, moderator, business_user]
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: User role updated successfully
 */
router.put('/:id/role',
  authenticateToken,
  checkRole('admin'),
  [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('role').isIn(['user', 'admin', 'moderator', 'business_user']).withMessage('Invalid role'),
    body('permissions').optional().isArray().withMessage('Permissions must be an array')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { id } = req.params;
    const { role, permissions } = req.body;
    
    const user = await User.findByIdAndUpdate(
      id,
      {
        role,
        ...(permissions && { permissions })
      },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    logger.logBusinessOperation('user_role_updated', {
      adminId: req.user.id,
      targetUserId: id,
      newRole: role,
      permissions
    });
    
    res.json({
      success: true,
      message: 'User role updated successfully',
      data: {
        user
      }
    });
  })
);

/**
 * @swagger
 * /api/users/{id}/status:
 *   put:
 *     summary: Update user status (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: User status updated successfully
 */
router.put('/:id/status',
  authenticateToken,
  checkRole('admin'),
  [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('isActive').isBoolean().withMessage('isActive must be a boolean'),
    body('reason').optional().isLength({ min: 1, max: 500 }).withMessage('Reason must be 1-500 characters')
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { id } = req.params;
    const { isActive, reason } = req.body;
    
    const user = await User.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // 如果停用用户，清除其刷新令牌
    if (!isActive) {
      await safeRedisOperation({
        method: 'del',
        args: [`refresh_token:${id}`]
      });
    }
    
    logger.logBusinessOperation('user_status_updated', {
      adminId: req.user.id,
      targetUserId: id,
      isActive,
      reason
    });
    
    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        user
      }
    });
  })
);

module.exports = router;