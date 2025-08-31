const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authMiddleware: authenticateToken, requirePermission: checkPermission } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// 验证规则
const updateSettingsValidation = [
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Invalid theme value'),
  body('language')
    .optional()
    .isIn(['zh-CN', 'en-US', 'ja-JP'])
    .withMessage('Invalid language value'),
  body('notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notification must be boolean'),
  body('notifications.push')
    .optional()
    .isBoolean()
    .withMessage('Push notification must be boolean'),
  body('notifications.sms')
    .optional()
    .isBoolean()
    .withMessage('SMS notification must be boolean'),
  body('privacy.profileVisible')
    .optional()
    .isBoolean()
    .withMessage('Profile visibility must be boolean'),
  body('privacy.activityVisible')
    .optional()
    .isBoolean()
    .withMessage('Activity visibility must be boolean'),
  body('privacy.dataCollection')
    .optional()
    .isBoolean()
    .withMessage('Data collection must be boolean'),
  body('ai.defaultModel')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Default model must be a valid string'),
  body('ai.temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  body('ai.maxTokens')
    .optional()
    .isInt({ min: 1, max: 32000 })
    .withMessage('Max tokens must be between 1 and 32000'),
  body('ai.streamResponse')
    .optional()
    .isBoolean()
    .withMessage('Stream response must be boolean')
];

/**
 * @swagger
 * /api/user/settings:
 *   get:
 *     summary: Get user settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     theme:
 *                       type: string
 *                       enum: [light, dark, auto]
 *                     language:
 *                       type: string
 *                       enum: [zh-CN, en-US, ja-JP]
 *                     notifications:
 *                       type: object
 *                     privacy:
 *                       type: object
 *                     ai:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/',
  authenticateToken,
  catchAsync(async (req, res) => {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('settings');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // 返回用户设置，如果没有设置则返回默认值
    const defaultSettings = {
      theme: 'light',
      language: 'zh-CN',
      notifications: {
        email: true,
        push: false,
        sms: false
      },
      privacy: {
        profileVisible: true,
        activityVisible: false,
        dataCollection: true
      },
      ai: {
        defaultModel: 'openai/gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2048,
        streamResponse: true
      }
    };
    
    const userSettings = user.settings ? user.settings.toObject() : {};
    const mergedSettings = {
      ...defaultSettings,
      ...userSettings,
      notifications: {
        ...defaultSettings.notifications,
        ...(userSettings.notifications || {})
      },
      privacy: {
        ...defaultSettings.privacy,
        ...(userSettings.privacy || {})
      },
      ai: {
        ...defaultSettings.ai,
        ...(userSettings.ai || {})
      }
    };
    
    res.json({
      success: true,
      data: mergedSettings
    });
  })
);

/**
 * @swagger
 * /api/user/settings:
 *   put:
 *     summary: Update user settings
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: [light, dark, auto]
 *               language:
 *                 type: string
 *                 enum: [zh-CN, en-US, ja-JP]
 *               notifications:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: boolean
 *                   push:
 *                     type: boolean
 *                   sms:
 *                     type: boolean
 *               privacy:
 *                 type: object
 *                 properties:
 *                   profileVisible:
 *                     type: boolean
 *                   activityVisible:
 *                     type: boolean
 *                   dataCollection:
 *                     type: boolean
 *               ai:
 *                 type: object
 *                 properties:
 *                   defaultModel:
 *                     type: string
 *                   temperature:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 2
 *                   maxTokens:
 *                     type: integer
 *                     minimum: 1
 *                     maximum: 32000
 *                   streamResponse:
 *                     type: boolean
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.put('/',
  authenticateToken,
  updateSettingsValidation,
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
    const newSettings = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // 合并现有设置和新设置
    const currentSettings = user.settings || {};
    const mergedSettings = {
      ...currentSettings,
      ...newSettings,
      notifications: {
        ...(currentSettings.notifications || {}),
        ...(newSettings.notifications || {})
      },
      privacy: {
        ...(currentSettings.privacy || {}),
        ...(newSettings.privacy || {})
      },
      ai: {
        ...(currentSettings.ai || {}),
        ...(newSettings.ai || {})
      }
    };
    
    // 更新用户设置
    user.settings = mergedSettings;
    await user.save();
    
    logger.info('User settings updated', {
      userId,
      updatedFields: Object.keys(newSettings)
    });
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: mergedSettings
    });
  })
);

/**
 * @swagger
 * /api/user/settings/reset:
 *   post:
 *     summary: Reset user settings to default
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings reset successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/reset',
  authenticateToken,
  checkPermission('user:write'),
  catchAsync(async (req, res) => {
    const userId = req.user.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // 重置为默认设置
    const defaultSettings = {
      theme: 'light',
      language: 'zh-CN',
      notifications: {
        email: true,
        push: false,
        sms: false
      },
      privacy: {
        profileVisible: true,
        activityVisible: false,
        dataCollection: true
      },
      ai: {
        defaultModel: 'openai/gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2048,
        streamResponse: true
      }
    };
    
    user.settings = defaultSettings;
    await user.save();
    
    logger.info('User settings reset to default', { userId });
    
    res.json({
      success: true,
      message: 'Settings reset to default successfully',
      data: defaultSettings
    });
  })
);

module.exports = router;