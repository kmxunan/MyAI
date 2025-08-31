const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { authMiddleware: authenticateToken, requirePermission: checkPermission } = require('../middleware/auth');
const { catchAsync } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const { openRouterService } = require('../services/openRouterService');
const { chatService } = require('../services/chatService');

const router = express.Router();

// 速率限制配置
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30条消息
  message: {
    error: 'Too many messages sent, please slow down.',
    retryAfter: 60
  },
  keyGenerator: (req) => req.user?.id || req.ip
});

const conversationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 50, // 每小时最多创建50个对话
  message: {
    error: 'Too many conversations created, please try again later.',
    retryAfter: 60 * 60
  },
  keyGenerator: (req) => req.user?.id || req.ip
});

// 验证规则
const createConversationValidation = [
  body('title')
    .optional()
    .isLength({ min: 1, max: 200 })
    .trim()
    .withMessage('Title must be between 1 and 200 characters'),
  body('type')
    .optional()
    .isIn(['chat', 'business', 'rag', 'code', 'creative'])
    .withMessage('Invalid conversation type'),
  body('model.provider')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Model provider must be a valid string'),
  body('model.name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Model name is required'),
  body('systemPrompt')
    .optional()
    .isLength({ max: 4000 })
    .withMessage('System prompt cannot exceed 4000 characters'),
  body('ragConfig.enabled')
    .optional()
    .isBoolean()
    .withMessage('RAG enabled must be a boolean'),
  body('businessContext.customerId')
    .optional()
    .isMongoId()
    .withMessage('Invalid customer ID'),
  body('businessContext.projectId')
    .optional()
    .isMongoId()
    .withMessage('Invalid project ID')
];

const sendMessageValidation = [
  body('content')
    .notEmpty()
    .isLength({ min: 1, max: 50000 })
    .withMessage('Message content is required and cannot exceed 50000 characters'),
  body('role')
    .optional()
    .isIn(['user', 'assistant', 'system'])
    .withMessage('Invalid message role'),
  body('parentMessageId')
    .optional()
    .isMongoId()
    .withMessage('Invalid parent message ID'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array'),
  body('attachments.*.type')
    .optional()
    .isIn(['image', 'file', 'audio', 'video', 'document'])
    .withMessage('Invalid attachment type'),
  body('attachments.*.url')
    .optional()
    .isURL()
    .withMessage('Invalid attachment URL')
];

// 辅助函数
const calculateTokens = (text) => {
  return Math.ceil(text.length / 4); // 简单估算
};

const calculateCost = (tokens, _model) => {
  return tokens * 0.0001; // 简单估算
};

/**
 * @swagger
 * /api/chat/conversations:
 *   get:
 *     summary: Get user conversations
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [chat, business, rag, code, creative]
 *         description: Filter by conversation type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, deleted]
 *         description: Filter by conversation status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of conversations to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of conversations to skip
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Conversation'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 */
router.get('/conversations', 
  authenticateToken, 
  checkPermission('chat:read'),
  [
    query('type').optional().isIn(['chat', 'business', 'rag', 'code', 'creative']),
    query('status').optional().isIn(['active', 'archived', 'deleted']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Conversation creation validation failed', {
        errors: errors.array(),
        requestBody: req.body,
        userId: req.user?.id
      });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { type, status = 'active', limit = 20, offset = 0 } = req.query;
    const userId = req.user.id;

    const filter = {
      user: userId,
      status
    };

    if (type) {
      filter.type = type;
    }

    const conversations = await Conversation.find(filter)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(offset)
      .select('-__v');

    const total = await Conversation.countDocuments(filter);

    res.json({
      success: true,
      data: conversations,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });
  })
);

/**
 * @swagger
 * /api/chat/conversations:
 *   post:
 *     summary: Create a new conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               type:
 *                 type: string
 *                 enum: [chat, business, rag, code, creative]
 *                 default: chat
 *               model:
 *                 type: object
 *                 properties:
 *                   provider:
 *                     type: string
 *                     enum: [openai, anthropic, google, meta, mistral, cohere, perplexity]
 *                   name:
 *                     type: string
 *                   version:
 *                     type: string
 *               systemPrompt:
 *                 type: string
 *                 maxLength: 4000
 *               ragConfig:
 *                 type: object
 *                 properties:
 *                   enabled:
 *                     type: boolean
 *                   knowledgeBaseId:
 *                     type: string
 *               businessContext:
 *                 type: object
 *                 properties:
 *                   customerId:
 *                     type: string
 *                   projectId:
 *                     type: string
 *     responses:
 *       201:
 *         description: Conversation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Conversation'
 */
router.post('/conversations',
  authenticateToken,
  checkPermission('chat:write'),
  conversationLimiter,
  createConversationValidation,
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
    
    // 获取用户设置中的默认模型
    const user = await User.findById(userId);
    const userDefaultModel = user.settings?.ai?.defaultModel || 'openai/gpt-4o-mini';
    const [defaultProvider, defaultName] = userDefaultModel.split('/');
    
    const {
      title,
      type = 'chat',
      model = {
        provider: defaultProvider || 'openai',
        name: defaultName || 'gpt-4o-mini',
        version: 'latest'
      },
      systemPrompt,
      ragConfig,
      businessContext
    } = req.body;

    // 验证模型是否可用
    const modelId = `${model.provider}/${model.name}`;
    const isValidModel = await openRouterService.validateModel(modelId);
    
    if (!isValidModel) {
      logger.warn('Invalid model requested', { modelId, userId });
      return res.status(400).json({
        success: false,
        message: `Model '${modelId}' is not available. Please select a valid model.`,
        code: 'INVALID_MODEL',
        availableModels: await openRouterService.getModels().then(data => 
          data.data.slice(0, 10).map(m => ({ id: m.id, name: m.name }))
        ).catch(() => [])
      });
    }

    const conversation = new Conversation({
      user: userId,
      title: title || `New ${type} conversation`,
      type,
      model,
      systemPrompt,
      ragConfig,
      businessContext,
      status: 'active'
    });

    await conversation.save();

    logger.logBusinessOperation('conversation_created', {
      userId,
      conversationId: conversation._id,
      type,
      model: `${model.provider}/${model.name}`
    });

    res.status(201).json({
      success: true,
      message: 'Conversation created successfully',
      data: conversation
    });
  })
);

/**
 * @swagger
 * /api/chat/conversations/{id}:
 *   get:
 *     summary: Get conversation details
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: Conversation details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Conversation'
 */
router.get('/conversations/:id',
  authenticateToken,
  checkPermission('chat:read'),
  [
    param('id').custom((value) => {
      // 接受MongoDB ObjectId或UUID格式
      if (mongoose.Types.ObjectId.isValid(value)) {
        return true;
      }
      // 检查是否为UUID格式
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(value)) {
        return true;
      }
      throw new Error('Invalid conversation ID format');
    })
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
    const userId = req.user.id;

    // 尝试通过_id或conversationId查找对话
    let conversation;
    if (mongoose.Types.ObjectId.isValid(id)) {
      // 如果是有效的ObjectId，通过_id查找
      conversation = await Conversation.findOne({
        _id: id,
        user: userId,
        status: { $ne: 'deleted' }
      })
        .select('-__v');
    } else {
      // 否则通过conversationId查找
      conversation = await Conversation.findOne({
        conversationId: id,
        user: userId,
        status: { $ne: 'deleted' }
      })
        .select('-__v');
    }
    
    // 如果第一次查找失败，尝试备用查找
    if (!conversation) {
      const searchConditions = [];
      
      // 如果是有效的ObjectId，添加_id查找条件
      if (mongoose.Types.ObjectId.isValid(id)) {
        searchConditions.push({ _id: id });
      }
      
      // 总是添加conversationId查找条件
      searchConditions.push({ conversationId: id });
      
      conversation = await Conversation.findOne({
        $or: searchConditions,
        user: userId,
        status: { $ne: 'deleted' }
      })
        .select('-__v');
    }

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      data: conversation
    });
  })
);

/**
 * @swagger
 * /api/chat/conversations/{id}/messages:
 *   get:
 *     summary: Get conversation messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of messages to return
 *       - in: query
 *         name: before
 *         schema:
 *           type: string
 *         description: Message ID to paginate before
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     hasMore:
 *                       type: boolean
 *                     nextCursor:
 *                       type: string
 */
router.get('/conversations/:id/messages',
  authenticateToken,
  checkPermission('chat:read'),
  [
    param('id').isMongoId().withMessage('Invalid conversation ID'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('before').optional().isMongoId().withMessage('Invalid message ID')
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
    const { limit = 50, before } = req.query;
    const userId = req.user.id;

    // 验证对话存在且属于用户
    const conversation = await Conversation.findOne({
      _id: id,
      user: userId,
      status: { $ne: 'deleted' }
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    const filter = { conversation: id };
    if (before) {
      filter._id = { $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1) // 多获取一条用于判断是否还有更多
      .select('-__v');

    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop(); // 移除多获取的那条
    }

    const nextCursor = hasMore ? messages[messages.length - 1]._id : null;

    res.json({
      success: true,
      data: messages.reverse(), // 反转为正序
      pagination: {
        hasMore,
        nextCursor
      }
    });
  })
);

/**
 * @swagger
 * /api/chat/conversations/{id}/messages:
 *   post:
 *     summary: Send a message in conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 50000
 *               role:
 *                 type: string
 *                 enum: [user, assistant, system]
 *                 default: user
 *               parentMessageId:
 *                 type: string
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [image, file, audio, video, document]
 *                     url:
 *                       type: string
 *                       format: uri
 *                     name:
 *                       type: string
 *                     size:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     userMessage:
 *                       $ref: '#/components/schemas/Message'
 *                     aiMessage:
 *                       $ref: '#/components/schemas/Message'
 */
router.post('/conversations/:id/messages',
  authenticateToken,
  checkPermission('chat:write'),
  chatLimiter,
  [
    param('id').isMongoId().withMessage('Invalid conversation ID'),
    ...sendMessageValidation
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
    const { content, role = 'user', parentMessageId, attachments } = req.body;
    const userId = req.user.id;

    // 验证对话存在且属于用户
    const conversation = await Conversation.findOne({
      _id: id,
      user: userId,
      status: 'active'
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or inactive'
      });
    }

    // 获取用户信息
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 计算输入token和成本
    const inputTokens = calculateTokens(content);
    const cost = calculateCost(inputTokens, conversation.model.name);

    // 创建用户消息
    const userMessage = new Message({
      conversation: id,
      user: userId,
      content,
      role,
      parentMessage: parentMessageId,
      attachments,
      tokens: {
        input: inputTokens,
        output: 0,
        total: inputTokens
      },
      cost: cost,
      model: {
        provider: conversation.model.provider,
        name: conversation.model.name,
        version: conversation.model.version
      }
    });
    
    await userMessage.save();
    
    // 更新对话统计
    await conversation.updateStats({
      tokens: inputTokens,
      cost
    });
    
    // 更新用户AI使用统计
    await user.updateAIUsage(inputTokens, 1);
    
    logger.logBusinessOperation('message_sent', {
      userId,
      conversationId: id,
      messageId: userMessage._id,
      tokens: inputTokens,
      cost
    });
    
    // 生成AI回复
    const startTime = Date.now();
    
    try {
      // 构建消息历史（排除错误消息）
      const messageHistory = await Message.find({
        conversation: id,
        role: { $in: ['user', 'assistant'] },
        error: { $exists: false } // 排除包含错误的消息
      })
        .sort({ createdAt: 1 })
        .limit(20) // 限制历史消息数量
        .select('content role');
      
      // 构建OpenRouter消息格式
      const messages = [
        ...(conversation.systemPrompt ? [{ role: 'system', content: conversation.systemPrompt }] : []),
        ...messageHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content }
      ];
      
      // 构建正确的OpenRouter模型ID格式 (provider/model-name)
      console.log('Original conversation model:', JSON.stringify(conversation.model, null, 2));
      const modelId = conversation.model.provider && conversation.model.name 
        ? `${conversation.model.provider}/${conversation.model.name}`
        : conversation.model.name || 'openai/gpt-3.5-turbo'; // 默认模型
      console.log('Constructed modelId:', modelId);
      
      // 调用OpenRouter API
      const aiResponse = await openRouterService.chatCompletion({
        model: modelId,
        messages,
        temperature: conversation.settings?.temperature || 0.7,
        maxTokens: conversation.settings?.maxTokens || 2048,
        user: userId.toString()
      });
      
      const aiResponseContent = aiResponse.choices[0].message.content;
      const responseTime = Date.now() - startTime;
      
      // 计算token和成本
      const outputTokens = aiResponse.usage.completion_tokens;
      const totalTokens = aiResponse.usage.total_tokens;
      const outputCost = await openRouterService.calculateCost(
        conversation.model.name,
        aiResponse.usage.prompt_tokens,
        outputTokens
      );
      
      const aiMessage = new Message({
        conversation: id,
        user: userId,
        content: aiResponseContent,
        role: 'assistant',
        parentMessage: userMessage._id,
        tokens: {
          input: aiResponse.usage.prompt_tokens,
          output: outputTokens,
          total: totalTokens
        },
        cost: outputCost.total || 0,
        model: {
          provider: conversation.model.provider,
          name: conversation.model.name,
          version: conversation.model.version
        },
        responseTime
      });
      
      await aiMessage.save();
      
      // 更新对话统计
      await conversation.updateStats({
        tokens: outputTokens,
        cost: outputCost.total || 0,
        responseTime
      });
      
      // 更新用户AI使用统计
      await user.updateAIUsage(outputTokens);
      
      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: {
          userMessage,
          aiMessage
        }
      });
      
    } catch (aiError) {
      // 输出完整的错误信息用于调试
      console.log('OpenRouter API Error Details:', JSON.stringify(aiError, null, 2));
      if (aiError.response && aiError.response.data) {
        console.log('OpenRouter Error Response:', JSON.stringify(aiError.response.data, null, 2));
      }
      
      logger.logError('AI response generation failed', aiError, {
        userId,
        conversationId: id,
        messageId: userMessage._id
      });
      
      // 创建错误回复消息
      const errorMessage = new Message({
        conversation: id,
        user: userId,
        content: 'I apologize, but I encountered an error while processing your message. Please try again.',
        role: 'assistant',
        parentMessage: userMessage._id,
        tokens: { input: 0, output: 0, total: 0 },
        cost: 0,
        model: {
          provider: conversation.model.provider,
          name: conversation.model.name,
          version: conversation.model.version
        },
        responseTime: Date.now() - startTime,
        error: {
          message: aiError.message,
          type: 'ai_generation_error'
        }
      });
      
      await errorMessage.save();
      
      return res.status(201).json({
        success: true,
        message: 'Message sent, but AI response failed',
        data: {
          userMessage,
          aiMessage: errorMessage
        },
        warning: 'AI response generation failed'
      });
    }
  })
);

/**
 * @swagger
 * /api/chat/conversations/{id}:
 *   put:
 *     summary: Update conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 maxLength: 200
 *               systemPrompt:
 *                 type: string
 *                 maxLength: 4000
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               isFavorite:
 *                 type: boolean
 *               isPinned:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Conversation updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Conversation'
 */
router.put('/conversations/:id',
  authenticateToken,
  checkPermission('chat:write'),
  [
    param('id').isMongoId().withMessage('Invalid conversation ID'),
    body('title').optional().isLength({ min: 1, max: 200 }).trim(),
    body('systemPrompt').optional().isLength({ max: 4000 }),
    body('tags').optional().isArray(),
    body('isFavorite').optional().isBoolean(),
    body('isPinned').optional().isBoolean()
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
    const userId = req.user.id;
    const updates = req.body;

    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: id,
        user: userId,
        status: { $ne: 'deleted' }
      },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      message: 'Conversation updated successfully',
      data: conversation
    });
  })
);

/**
 * @swagger
 * /api/chat/conversations/{id}:
 *   delete:
 *     summary: Delete conversation
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: Conversation deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete('/conversations/:id',
  authenticateToken,
  checkPermission('chat:delete'),
  [
    param('id').isMongoId().withMessage('Invalid conversation ID')
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
    const userId = req.user.id;

    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: id,
        user: userId,
        status: { $ne: 'deleted' }
      },
      { status: 'deleted' },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  })
);

/**
 * @swagger
 * /api/chat/messages/{id}:
 *   delete:
 *     summary: Delete message
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID
 *     responses:
 *       200:
 *         description: Message deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete('/messages/:id',
  authenticateToken,
  checkPermission('chat:delete'),
  [
    param('id').isMongoId().withMessage('Invalid message ID')
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
    const userId = req.user.id;

    // 查找消息并验证权限
    const message = await Message.findById(id).populate('conversation');
    
    if (!message || message.conversation.user.toString() !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    await Message.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  })
);

/**
 * @swagger
 * /api/chat/search:
 *   get:
 *     summary: Search messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: string
 *         description: Limit search to specific conversation
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 total:
 *                   type: integer
 */
router.get('/search',
  authenticateToken,
  checkPermission('chat:read'),
  [
    query('q').notEmpty().withMessage('Search query is required'),
    query('conversationId').optional().isMongoId().withMessage('Invalid conversation ID'),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt()
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

    const { q, conversationId, limit = 20 } = req.query;
    const userId = req.user.id;

    // 构建搜索条件
    const searchFilter = {
      $text: { $search: q }
    };

    // 如果指定了对话ID，添加到过滤条件
    if (conversationId) {
      searchFilter.conversation = conversationId;
    }

    // 查找用户的对话ID列表
    const userConversations = await Conversation.find(
      { user: userId, status: { $ne: 'deleted' } },
      '_id'
    );
    const conversationIds = userConversations.map(c => c._id);

    // 在用户的对话中搜索消息
    searchFilter.conversation = { $in: conversationIds };

    const messages = await Message.find(searchFilter)
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .populate('conversation', 'title type')
      .select('content role createdAt conversation score');

    const total = await Message.countDocuments(searchFilter);

    res.json({
      success: true,
      data: messages,
      total
    });
  })
);

/**
 * @swagger
 * /api/chat/models:
 *   get:
 *     summary: Get available AI models
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available models
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/models',
  catchAsync(async (req, res) => {
    try {
      const models = await openRouterService.getModels();
      res.json({
        success: true,
        data: models
      });
    } catch (error) {
      logger.logError('Failed to fetch models', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch available models'
      });
    }
  })
);

router.get('/models/categorized',
  catchAsync(async (req, res) => {
    try {
      const categorizedModels = await openRouterService.getCategorizedModels();
      res.json({
        success: true,
        data: categorizedModels
      });
    } catch (error) {
      logger.logError('Failed to fetch categorized models', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categorized models'
      });
    }
  })
);

router.get('/models/:modelId',
  authenticateToken,
  checkPermission('chat:read'),
  [
    param('modelId').isString().trim().withMessage('Model ID is required')
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

    const { modelId } = req.params;
    
    try {
      const modelInfo = await openRouterService.getModelInfo(modelId);
      res.json({
        success: true,
        data: modelInfo
      });
    } catch (error) {
      logger.logError('Failed to fetch model info', error, { modelId });
      res.status(404).json({
        success: false,
        message: 'Model not found'
      });
    }
  })
);

router.post('/models/recommend',
  authenticateToken,
  checkPermission('chat:read'),
  [
    body('task').optional().isIn(['chat', 'embedding', 'completion']).withMessage('Invalid task type'),
    body('budget').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid budget level'),
    body('needsVision').optional().isBoolean().withMessage('needsVision must be boolean'),
    body('needsFunctions').optional().isBoolean().withMessage('needsFunctions must be boolean'),
    body('maxTokens').optional().isInt({ min: 1 }).withMessage('maxTokens must be positive integer')
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

    const requirements = req.body;
    
    try {
      const recommendations = await openRouterService.recommendModel(requirements);
      res.json({
        success: true,
        data: recommendations
      });
    } catch (error) {
      logger.logError('Failed to get model recommendations', error, { requirements });
      res.status(500).json({
        success: false,
        message: 'Failed to get model recommendations'
      });
    }
  })
);

/**
 * @swagger
 * /api/chat/stats:
 *   get:
 *     summary: Get chat statistics
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d]
 *           default: 30d
 *         description: Statistics period
 *     responses:
 *       200:
 *         description: Chat statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
router.get('/stats',
  authenticateToken,
  checkPermission('chat:read'),
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('Invalid period')
  ],
  catchAsync(async (req, res) => {
    const { period = '30d' } = req.query;
    const userId = req.user.id;
    
    const days = parseInt(period.replace('d', ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const stats = await chatService.getUserStats(userId, startDate);
    
    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * @swagger
 * /api/chat/health:
 *   get:
 *     summary: Check chat service health
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: Service health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health',
  catchAsync(async (req, res) => {
    try {
      const healthStatus = await openRouterService.healthCheck();
      res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          openRouter: healthStatus
        }
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  })
);

module.exports = router;