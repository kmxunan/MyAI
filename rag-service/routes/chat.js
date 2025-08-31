const express = require('express');
const {
  body,
  param,
  query,
  validationResult,
} = require('express-validator');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');
const {
  catchAsync,
  ValidationError,
  NotFoundError,
} = require('../middleware/errorHandler');
const vectorService = require('../services/vectorService');
const llmService = require('../services/llmService');
// const { authorize, requirePermissions } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for chat operations
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 chat requests per windowMs
  message: {
    error: 'Too many chat requests, please try again later.',
  },
});

const streamLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 streaming requests per minute
  message: {
    error: 'Too many streaming requests, please try again later.',
  },
});

router.use(chatLimiter);

/**
 * Validation middleware
 */
const validateKnowledgeBaseId = [
  param('knowledgeBaseId')
    .isMongoId()
    .withMessage('Invalid knowledge base ID'),
];

const validateChatRequest = [
  body('message')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message must be between 1 and 2000 characters'),
  body('conversationId')
    .optional()
    .isMongoId()
    .withMessage('Invalid conversation ID'),
  body('model')
    .optional()
    .matches(/^(openai|anthropic|google|meta|mistral|cohere)\/.+$/)
    .withMessage('Model must be in format provider/model-name (e.g., openai/gpt-3.5-turbo)'),
  body('temperature')
    .optional()
    .isFloat({ min: 0, max: 2 })
    .withMessage('Temperature must be between 0 and 2'),
  body('maxTokens')
    .optional()
    .isInt({ min: 1, max: 4000 })
    .withMessage('Max tokens must be between 1 and 4000'),
  body('searchOptions')
    .optional()
    .isObject()
    .withMessage('Search options must be an object'),
  body('searchOptions.limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .withMessage('Search limit must be between 1 and 20'),
  body('searchOptions.threshold')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Search threshold must be between 0 and 1'),
  body('searchOptions.searchType')
    .optional()
    .isIn(['semantic', 'keyword', 'hybrid'])
    .withMessage('Invalid search type'),
  body('includeContext')
    .optional()
    .isBoolean()
    .withMessage('Include context must be a boolean'),
  body('stream')
    .optional()
    .isBoolean()
    .withMessage('Stream must be a boolean'),
];

const validateConversationHistory = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
];

/**
 * Helper function to check validation results
 */
const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }
  next();
};

/**
 * Chat utilities
 */
const performRAGSearch = async (message, knowledgeBaseId, options = {}) => {
  const {
    searchType = 'hybrid',
    limit = 5,
    threshold = 0.7,
  } = options;

  try {
    // Use vector service for RAG search
    const searchResults = await vectorService.searchVectors(
      message,
      {
        knowledgeBaseId,
        threshold,
        limit,
        searchType,
      },
    );

    return searchResults;
  } catch (error) {
    logger.logError('RAG search failed', error, {
      knowledgeBaseId,
      message: message.substring(0, 100),
    });
    return [];
  }
};

const generateResponse = async (message, context, options = {}) => {
  const {
    model = 'openai/gpt-3.5-turbo',
    temperature = 0.7,
    maxTokens = 1000,
    conversationHistory = [],
  } = options;

  try {
    // Build context prompt
    let contextPrompt = '';
    if (context && context.length > 0) {
      const contextItems = context.map((item, index) => (
        `[${index + 1}] ${item.content} (Source: ${item.title})`
      )).join('\n\n');
      contextPrompt = `\n\nRelevant context from knowledge base:\n${contextItems}`;
    }

    const systemPrompt = 'You are a helpful AI assistant with access to a knowledge base. '
      + 'Use the provided context to answer questions accurately and cite your sources when possible. '
      + `If the context doesn't contain relevant information, say so clearly.${contextPrompt}`;

    // Build messages array for LLM API
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    // Call LLM API
    const response = await llmService.generateCompletion(messages, {
      model,
      temperature,
      maxTokens,
    });

    // Add sources to response
    response.sources = context.map((item) => ({
      documentId: item.documentId,
      title: item.title,
      filename: item.filename,
      score: item.score,
    }));

    return response;
  } catch (error) {
    throw new Error(`Response generation failed: ${error.message}`);
  }
};

const saveConversation = async (conversationId, message, response, userId, knowledgeBaseId) => {
  try {
    const conversation = {
      id: conversationId,
      userId,
      knowledgeBaseId,
      messages: [
        {
          id: `msg_${Date.now()}_user`,
          role: 'user',
          content: message,
          timestamp: new Date().toISOString(),
        },
        {
          id: `msg_${Date.now()}_assistant`,
          role: 'assistant',
          content: response.content,
          model: response.model,
          usage: response.usage,
          sources: response.sources,
          timestamp: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };

    // Cache conversation
    await cache.set(`conversation:${conversationId}`, conversation, 3600 * 24); // 24 hours

    return conversation;
  } catch (error) {
    logger.logError('Failed to save conversation', error, {
      conversationId,
      userId,
      knowledgeBaseId,
    });
    throw error;
  }
};

/**
 * @swagger
 * components:
 *   schemas:
 *     ChatMessage:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Message ID
 *         role:
 *           type: string
 *           enum: [user, assistant, system]
 *         content:
 *           type: string
 *           description: Message content
 *         model:
 *           type: string
 *           description: Model used for generation (assistant messages only)
 *         usage:
 *           type: object
 *           properties:
 *             promptTokens:
 *               type: integer
 *             completionTokens:
 *               type: integer
 *             totalTokens:
 *               type: integer
 *         sources:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               documentId:
 *                 type: string
 *               title:
 *                 type: string
 *               filename:
 *                 type: string
 *               score:
 *                 type: number
 *         timestamp:
 *           type: string
 *           format: date-time
 *
 *     ChatRequest:
 *       type: object
 *       required:
 *         - message
 *       properties:
 *         message:
 *           type: string
 *           description: User message
 *           minLength: 1
 *           maxLength: 2000
 *         conversationId:
 *           type: string
 *           description: Existing conversation ID (optional)
 *         model:
 *           type: string
 *           pattern: ^(openai|anthropic|google|meta|mistral|cohere)\/.+$
 *           default: openai/gpt-3.5-turbo
 *           example: openai/gpt-3.5-turbo
 *         temperature:
 *           type: number
 *           minimum: 0
 *           maximum: 2
 *           default: 0.7
 *         maxTokens:
 *           type: integer
 *           minimum: 1
 *           maximum: 4000
 *           default: 1000
 *         searchOptions:
 *           type: object
 *           properties:
 *             limit:
 *               type: integer
 *               minimum: 1
 *               maximum: 20
 *               default: 5
 *             threshold:
 *               type: number
 *               minimum: 0
 *               maximum: 1
 *               default: 0.7
 *             searchType:
 *               type: string
 *               enum: [semantic, keyword, hybrid]
 *               default: hybrid
 *         includeContext:
 *           type: boolean
 *           default: true
 *         stream:
 *           type: boolean
 *           default: false
 */

/**
 * @swagger
 * /api/chat/{knowledgeBaseId}:
 *   post:
 *     summary: Chat with knowledge base
 *     description: Send a message and get an AI response based on knowledge base content
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgeBaseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge base ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatRequest'
 *     responses:
 *       200:
 *         description: Chat response generated successfully
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
 *                     conversationId:
 *                       type: string
 *                     message:
 *                       $ref: '#/components/schemas/ChatMessage'
 *                     response:
 *                       $ref: '#/components/schemas/ChatMessage'
 *                     context:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           documentId:
 *                             type: string
 *                           title:
 *                             type: string
 *                           content:
 *                             type: string
 *                           score:
 *                             type: number
 *                     responseTime:
 *                       type: number
 *                       description: Response time in milliseconds
 */
router.post(
  '/:knowledgeBaseId',
  validateKnowledgeBaseId,
  validateChatRequest,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId } = req.params;
    const {
      message,
      conversationId,
      model = 'openai/gpt-3.5-turbo',
      temperature = 0.7,
      maxTokens = 1000,
      searchOptions = {},
      includeContext = true,
    } = req.body;
    const userId = req.user?.id || 'anonymous';
    const startTime = Date.now();

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user?.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Generate conversation ID if not provided
    const currentConversationId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Perform RAG search if context is requested
    let context = [];
    if (includeContext) {
      context = await performRAGSearch(message, knowledgeBaseId, searchOptions);
    }

    // Get conversation history if continuing existing conversation
    let conversationHistory = [];
    if (conversationId) {
      const existingConversation = await cache.get(`conversation:${conversationId}`);
      if (existingConversation && existingConversation.userId === userId) {
        conversationHistory = existingConversation.messages || [];
      }
    }

    // Generate response
    const response = await generateResponse(message, context, {
      model,
      temperature,
      maxTokens,
      conversationHistory,
    });

    // Create message objects
    const userMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    const assistantMessage = {
      id: `msg_${Date.now()}_assistant`,
      role: 'assistant',
      content: response.content,
      model: response.model,
      usage: response.usage,
      sources: response.sources,
      timestamp: new Date().toISOString(),
    };

    // Save conversation
    await saveConversation(currentConversationId, message, response, userId, knowledgeBaseId);

    const responseTime = Date.now() - startTime;

    logger.logRAG('Chat response generated', {
      userId,
      knowledgeBaseId,
      conversationId: currentConversationId,
      messageLength: message.length,
      responseLength: response.content.length,
      contextCount: context.length,
      model,
      responseTime,
      tokenUsage: response.usage,
    });

    res.json({
      success: true,
      data: {
        conversationId: currentConversationId,
        message: userMessage,
        response: assistantMessage,
        context: includeContext ? context : undefined,
        responseTime,
      },
    });
  }),
);

/**
 * @swagger
 * /api/chat/{knowledgeBaseId}/stream:
 *   post:
 *     summary: Stream chat with knowledge base
 *     description: Send a message and get a streaming AI response
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgeBaseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge base ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatRequest'
 *     responses:
 *       200:
 *         description: Streaming response
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: Server-sent events stream
 */
router.post(
  '/:knowledgeBaseId/stream',
  streamLimiter,
  validateKnowledgeBaseId,
  validateChatRequest,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId } = req.params;
    const {
      message,
      conversationId,
      model = 'openai/gpt-3.5-turbo',
      temperature = 0.7,
      maxTokens = 1000,
      searchOptions = {},
      includeContext = true,
    } = req.body;
    const userId = req.user?.id || 'anonymous';

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user?.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Heartbeat for keeping connection alive
    const HEARTBEAT_INTERVAL = 15000; // 15s
    const writeSSE = (event) => {
      try {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (e) {
        logger.logError('SSE write failed', e);
      }
    };

    const heartbeatTimer = setInterval(() => {
      writeSSE({ type: 'heartbeat', ts: Date.now() });
    }, HEARTBEAT_INTERVAL);

    // Client disconnect handling
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
      clearInterval(heartbeatTimer);
      logger.info('SSE client disconnected', {
        userId,
        knowledgeBaseId,
      });
      try {
        if (!res.writableEnded) {
          res.end();
        }
      } catch (e) {
        // ignore
      }
    });

    const currentConversationId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Send initial event with conversation ID
      writeSSE({
        type: 'conversation_start',
        conversationId: currentConversationId,
      });

      // Perform RAG search if context is requested
      let context = [];
      if (includeContext) {
        writeSSE({ type: 'search_start' });

        context = await performRAGSearch(message, knowledgeBaseId, searchOptions);

        writeSSE({
          type: 'search_complete',
          context,
        });
      }

      // Start response generation
      writeSSE({ type: 'response_start' });

      // Generate streaming response
      let fullContent = '';
      let usage = null;

      // Generate response and simulate streaming
      const generatedResponse = await generateResponse(message, context, {
        model,
        temperature,
        maxTokens,
      });

      fullContent = generatedResponse.content;
      usage = generatedResponse.usage;

      // Simulate streaming by sending the full response
      writeSSE({
        type: 'response_chunk',
        content: fullContent,
        delta: fullContent,
      });

      // Build response object
      const response = {
        content: fullContent,
        model,
        usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        sources: context.map((item) => ({
          documentId: item.documentId,
          title: item.title,
          filename: item.filename,
          score: item.score,
        })),
      };

      // Send completion event
      writeSSE({
        type: 'response_complete',
        usage: response.usage,
        sources: response.sources,
      });

      // Save conversation
      await saveConversation(currentConversationId, message, response, userId, knowledgeBaseId);

      logger.logRAG('Streaming chat completed', {
        userId,
        knowledgeBaseId,
        conversationId: currentConversationId,
        messageLength: message.length,
        responseLength: response.content.length,
        contextCount: context.length,
        model,
      });
    } catch (error) {
      writeSSE({
        type: 'error',
        error: error.message,
      });

      logger.logError('Streaming chat failed', error, {
        userId,
        knowledgeBaseId,
        conversationId: currentConversationId,
      });
    } finally {
      clearInterval(heartbeatTimer);
      if (!clientClosed) {
        try {
          if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }),
);

/**
 * @swagger
 * /api/chat/{knowledgeBaseId}/conversations:
 *   get:
 *     summary: Get conversation history
 *     description: Retrieve conversation history for a knowledge base
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgeBaseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge base ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of conversations per page
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully
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
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       messageCount:
 *                         type: integer
 *                       lastMessage:
 *                         type: string
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */
router.get(
  '/:knowledgeBaseId/conversations',
  validateKnowledgeBaseId,
  validateConversationHistory,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user?.id || 'anonymous';

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user?.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Build cache key
    const cacheKey = `conversations:list:${knowledgeBaseId}:${userId}:${page}:${limit}`;

    // Try to get from cache
    let result = await cache.get(cacheKey);

    if (!result) {
      // Implement actual database query
      const ChatSession = require('../models/ChatSession');
      
      const skip = (page - 1) * limit;
      
      // Get conversations with message count and last message
      const conversations = await ChatSession.aggregate([
        {
          $match: {
            knowledgeBaseId: knowledgeBase._id,
            userId: userId
          }
        },
        {
          $lookup: {
            from: 'messages',
            localField: '_id',
            foreignField: 'sessionId',
            as: 'messages'
          }
        },
        {
          $addFields: {
            messageCount: { $size: '$messages' },
            lastMessage: {
              $arrayElemAt: [
                {
                  $map: {
                    input: { $slice: [{ $sortArray: { input: '$messages', sortBy: { createdAt: -1 } } }, 1] },
                    as: 'msg',
                    in: '$$msg.content'
                  }
                },
                0
              ]
            }
          }
        },
        {
          $project: {
            id: '$_id',
            title: 1,
            messageCount: 1,
            lastMessage: 1,
            updatedAt: 1,
            createdAt: 1
          }
        },
        { $sort: { updatedAt: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit, 10) }
      ]);
      
      // Get total count for pagination
      const totalCount = await ChatSession.countDocuments({
        knowledgeBaseId: knowledgeBase._id,
        userId: userId
      });

      result = {
        data: conversations.map(conv => ({
          id: conv.id || conv._id,
          title: conv.title || 'Untitled Conversation',
          messageCount: conv.messageCount || 0,
          lastMessage: conv.lastMessage || 'No messages yet',
          updatedAt: conv.updatedAt?.toISOString() || conv.createdAt?.toISOString() || new Date().toISOString()
        })),
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: totalCount,
          pages: Math.ceil(totalCount / limit),
        },
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, result, 300);
    }

    logger.logRAG('Conversation history retrieved', {
      userId,
      knowledgeBaseId,
      count: result.data.length,
      page,
      limit,
    });

    res.json({
      success: true,
      ...result,
    });
  }),
);

/**
 * @swagger
 * /api/chat/{knowledgeBaseId}/conversations/{conversationId}:
 *   get:
 *     summary: Get conversation details
 *     description: Retrieve detailed conversation with all messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgeBaseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge base ID
 *       - in: path
 *         name: conversationId
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
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     knowledgeBaseId:
 *                       type: string
 *                     messages:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ChatMessage'
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 */
router.get(
  '/:knowledgeBaseId/conversations/:conversationId',
  validateKnowledgeBaseId,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId, conversationId } = req.params;
    const userId = req.user?.id || 'anonymous';

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Get conversation
    const conversation = await cache.get(`conversation:${conversationId}`);
    if (!conversation || conversation.userId !== userId || conversation.knowledgeBaseId !== knowledgeBaseId) {
      throw new NotFoundError('Conversation');
    }

    logger.logRAG('Conversation details retrieved', {
      userId,
      knowledgeBaseId,
      conversationId,
      messageCount: conversation.messages?.length || 0,
    });

    res.json({
      success: true,
      data: conversation,
    });
  }),
);

/**
 * @swagger
 * /api/chat/{knowledgeBaseId}/conversations/{conversationId}:
 *   delete:
 *     summary: Delete conversation
 *     description: Delete a conversation and all its messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgeBaseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge base ID
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: Conversation deleted successfully
 *       404:
 *         description: Conversation not found
 */
router.delete(
  '/:knowledgeBaseId/conversations/:conversationId',
  validateKnowledgeBaseId,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId, conversationId } = req.params;
    const userId = req.user?.id || 'anonymous';

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user?.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Get conversation to verify ownership
    const conversation = await cache.get(`conversation:${conversationId}`);
    if (!conversation || conversation.userId !== userId || conversation.knowledgeBaseId !== knowledgeBaseId) {
      throw new NotFoundError('Conversation');
    }

    // Delete conversation
    await cache.del(`conversation:${conversationId}`);

    // Clear conversation list cache
    const listKeys = await cache.keys(`conversations:list:${knowledgeBaseId}:${userId}:*`);
    if (listKeys.length > 0) {
      await Promise.all(listKeys.map((key) => cache.del(key)));
    }

    logger.logRAG('Conversation deleted', {
      userId,
      knowledgeBaseId,
      conversationId,
      messageCount: conversation.messages?.length || 0,
    });

    res.json({
      success: true,
      message: 'Conversation deleted successfully',
    });
  }),
);

module.exports = router;
