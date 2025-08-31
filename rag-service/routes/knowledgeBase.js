const express = require('express');
const {
  body,
  param,
  query,
  validationResult,
} = require('express-validator');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');
const {
  catchAsync,
  ValidationError,
  NotFoundError,
  ConflictError,
} = require('../middleware/errorHandler');
const {
  optionalAuth,
} = require('../middleware/auth');
const KnowledgeBase = require('../models/KnowledgeBase');

const router = express.Router();

// Rate limiting for knowledge base operations
const kbLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: {
    error: 'Too many knowledge base requests, please try again later.',
  },
});

router.use(kbLimiter);

/**
 * Validation middleware
 */
const validateKnowledgeBase = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('settings.embeddingModel')
    .optional()
    .isIn(['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'])
    .withMessage('Invalid embedding model'),
  body('settings.chunkSize')
    .optional()
    .isInt({ min: 100, max: 2000 })
    .withMessage('Chunk size must be between 100 and 2000'),
  body('settings.chunkOverlap')
    .optional()
    .isInt({ min: 0, max: 500 })
    .withMessage('Chunk overlap must be between 0 and 500'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be between 1 and 50 characters'),
];

const validateKnowledgeBaseUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('settings.embeddingModel')
    .optional()
    .isIn(['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'])
    .withMessage('Invalid embedding model'),
  body('settings.chunkSize')
    .optional()
    .isInt({ min: 100, max: 2000 })
    .withMessage('Chunk size must be between 100 and 2000'),
  body('settings.chunkOverlap')
    .optional()
    .isInt({ min: 0, max: 500 })
    .withMessage('Chunk overlap must be between 0 and 500'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be between 1 and 50 characters'),
];

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query must not exceed 100 characters'),
];

const validateKnowledgeBaseId = [
  param('id')
    .custom((value) => {
      // Allow 'default' as a special case
      if (value === 'default') {
        return true;
      }
      // Otherwise, validate as MongoDB ObjectId
      return mongoose.Types.ObjectId.isValid(value);
    })
    .withMessage('Invalid knowledge base ID'),
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
 * @swagger
 * components:
 *   schemas:
 *     KnowledgeBase:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         id:
 *           type: string
 *           description: Knowledge base ID
 *         name:
 *           type: string
 *           description: Knowledge base name
 *         description:
 *           type: string
 *           description: Knowledge base description
 *         userId:
 *           type: string
 *           description: Owner user ID
 *         settings:
 *           type: object
 *           properties:
 *             embeddingModel:
 *               type: string
 *               enum: [text-embedding-ada-002, text-embedding-3-small, text-embedding-3-large]
 *             chunkSize:
 *               type: integer
 *               minimum: 100
 *               maximum: 2000
 *             chunkOverlap:
 *               type: integer
 *               minimum: 0
 *               maximum: 500
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         documentCount:
 *           type: integer
 *           description: Number of documents in the knowledge base
 *         totalSize:
 *           type: integer
 *           description: Total size in bytes
 *         status:
 *           type: string
 *           enum: [active, inactive, processing]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/knowledge-base:
 *   get:
 *     summary: Get user's knowledge bases
 *     description: Retrieve all knowledge bases for the authenticated user
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query for knowledge base name or description
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated list of tags to filter by
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, processing]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Knowledge bases retrieved successfully
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
 *                     $ref: '#/components/schemas/KnowledgeBase'
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
router.get('/', optionalAuth, validatePagination, checkValidation, catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search,
    tags,
    status,
  } = req.query;
  const userId = req.user?.id || 'anonymous';

  // Build cache key
  const cacheKey = `kb:list:${userId}:${page}:${limit}:${search || ''}:${tags || ''}:${status || ''}`;

  // Try to get from cache
  let result = await cache.get(cacheKey);

  if (!result) {
    // Simulate database query (replace with actual implementation)
    let mockKnowledgeBases = [];

    // Only return data for authenticated users
    if (req.user?.id) {
      mockKnowledgeBases = [
        {
          id: '507f1f77bcf86cd799439011',
          name: 'Technical Documentation',
          description: 'Company technical documentation and API references',
          userId,
          settings: {
            embeddingModel: 'text-embedding-3-small',
            chunkSize: 1000,
            chunkOverlap: 200,
          },
          tags: ['technical', 'api', 'documentation'],
          documentCount: 25,
          totalSize: 1024000,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }

    result = {
      data: mockKnowledgeBases,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: mockKnowledgeBases.length,
        pages: Math.ceil(mockKnowledgeBases.length / limit),
      },
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, result, 300);
  }

  logger.logRAG('Knowledge bases retrieved', {
    userId,
    count: result.data.length,
    page,
    limit,
  });

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * @swagger
 * /api/knowledge-base:
 *   post:
 *     summary: Create a new knowledge base
 *     description: Create a new knowledge base for the authenticated user
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               settings:
 *                 type: object
 *                 properties:
 *                   embeddingModel:
 *                     type: string
 *                     enum: [text-embedding-ada-002, text-embedding-3-small, text-embedding-3-large]
 *                     default: text-embedding-3-small
 *                   chunkSize:
 *                     type: integer
 *                     minimum: 100
 *                     maximum: 2000
 *                     default: 1000
 *                   chunkOverlap:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 500
 *                     default: 200
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                   minLength: 1
 *                   maxLength: 50
 *     responses:
 *       201:
 *         description: Knowledge base created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/KnowledgeBase'
 *       400:
 *         description: Validation error
 *       409:
 *         description: Knowledge base with this name already exists
 */
router.post('/', optionalAuth, validateKnowledgeBase, checkValidation, catchAsync(async (req, res) => {
  const {
    name,
    description,
    settings = {},
    tags = [],
  } = req.body;
  const userId = req.user?.id || 'anonymous';

  // Check if knowledge base with same name exists for this user
  const existingKB = await cache.get(`kb:name:${userId}:${name}`);
  if (existingKB) {
    throw new ConflictError('Knowledge base with this name already exists');
  }

  // Create new knowledge base (simulate database operation)
  const knowledgeBase = {
    id: '507f1f77bcf86cd799439012',
    name,
    description: description || '',
    userId,
    settings: {
      embeddingModel: settings.embeddingModel || 'text-embedding-3-small',
      chunkSize: settings.chunkSize || 1000,
      chunkOverlap: settings.chunkOverlap || 200,
    },
    tags,
    documentCount: 0,
    totalSize: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Cache the new knowledge base
  await cache.set(`kb:${knowledgeBase.id}`, knowledgeBase, 3600);
  await cache.set(`kb:name:${userId}:${name}`, knowledgeBase.id, 3600);

  // Clear list cache
  const listKeys = await cache.keys(`kb:list:${userId}:*`);
  if (listKeys.length > 0) {
    await Promise.all(listKeys.map((key) => cache.del(key)));
  }

  logger.logRAG('Knowledge base created', {
    userId,
    knowledgeBaseId: knowledgeBase.id,
    name,
    embeddingModel: knowledgeBase.settings.embeddingModel,
  });

  res.status(201).json({
    success: true,
    data: knowledgeBase,
  });
}));

/**
 * @swagger
 * /api/knowledge-base/{id}:
 *   get:
 *     summary: Get knowledge base by ID
 *     description: Retrieve a specific knowledge base by its ID
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge base ID
 *     responses:
 *       200:
 *         description: Knowledge base retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/KnowledgeBase'
 *       404:
 *         description: Knowledge base not found
 */
router.get('/:id', optionalAuth, validateKnowledgeBaseId, checkValidation, catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  // Try to get from cache
  let knowledgeBase = await cache.get(`kb:${id}`);

  if (!knowledgeBase) {
    // Query from database

    // Handle special case for 'default' knowledge base
    if (id === 'default') {
      knowledgeBase = await KnowledgeBase.findOne({
        $or: [
          { knowledgeBaseId: 'default' },
          { name: 'Default Knowledge Base' },
        ],
      });

      // Create default knowledge base if it doesn't exist
      if (!knowledgeBase) {
        knowledgeBase = new KnowledgeBase({
          name: 'Default Knowledge Base',
          description: 'Default knowledge base for general queries',
          knowledgeBaseId: 'default',
          userId: userId || new mongoose.Types.ObjectId(),
          access: { isPublic: true },
        });
        await knowledgeBase.save();
      }
    } else {
      knowledgeBase = await KnowledgeBase.findOne({
        $or: [
          { _id: id },
          { knowledgeBaseId: id },
        ],
      });
    }

    if (!knowledgeBase) {
      throw new NotFoundError('Knowledge base');
    }

    // Cache the result
    await cache.set(`kb:${id}`, knowledgeBase, 300); // 5 minutes
  }

  // Check ownership (skip for public knowledge bases)
  if (!knowledgeBase.access
    ?.isPublic && userId && knowledgeBase.userId.toString() !== userId && req.user?.role !== 'admin'
  ) {
    throw new NotFoundError('Knowledge base');
  }

  logger.logRAG('Knowledge base retrieved', {
    userId: userId || 'anonymous',
    knowledgeBaseId: id,
  });

  res.json({
    success: true,
    data: knowledgeBase,
  });
}));

/**
 * @swagger
 * /api/knowledge-base/{id}:
 *   put:
 *     summary: Update knowledge base
 *     description: Update an existing knowledge base
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge base ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *                 maxLength: 500
 *               settings:
 *                 type: object
 *                 properties:
 *                   embeddingModel:
 *                     type: string
 *                     enum: [text-embedding-ada-002, text-embedding-3-small, text-embedding-3-large]
 *                   chunkSize:
 *                     type: integer
 *                     minimum: 100
 *                     maximum: 2000
 *                   chunkOverlap:
 *                     type: integer
 *                     minimum: 0
 *                     maximum: 500
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                   minLength: 1
 *                   maxLength: 50
 *     responses:
 *       200:
 *         description: Knowledge base updated successfully
 *       404:
 *         description: Knowledge base not found
 *       409:
 *         description: Knowledge base with this name already exists
 */
router.put(
  '/:id',
  optionalAuth,
  validateKnowledgeBaseId,
  validateKnowledgeBaseUpdate,
  checkValidation,
  catchAsync(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id || 'anonymous';
    const updates = req.body;

    // Get existing knowledge base
    const knowledgeBase = await cache.get(`kb:${id}`);

    if (!knowledgeBase) {
      throw new NotFoundError('Knowledge base');
    }

    // Check ownership
    if (knowledgeBase.userId !== userId && req.user.role !== 'admin') {
      throw new NotFoundError('Knowledge base');
    }

    // Check for name conflicts if name is being updated
    if (updates.name && updates.name !== knowledgeBase.name) {
      const existingKB = await cache.get(`kb:name:${userId}:${updates.name}`);
      if (existingKB && existingKB !== id) {
        throw new ConflictError('Knowledge base with this name already exists');
      }
    }

    // Update knowledge base
    const updatedKB = {
      ...knowledgeBase,
      ...updates,
      settings: {
        ...knowledgeBase.settings,
        ...(updates.settings || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    // Update cache
    await cache.set(`kb:${id}`, updatedKB, 3600);

    // Update name cache if name changed
    if (updates.name && updates.name !== knowledgeBase.name) {
      await cache.del(`kb:name:${userId}:${knowledgeBase.name}`);
      await cache.set(`kb:name:${userId}:${updates.name}`, id, 3600);
    }

    // Clear list cache
    const listKeys = await cache.keys(`kb:list:${userId}:*`);
    if (listKeys.length > 0) {
      await Promise.all(listKeys.map((key) => cache.del(key)));
    }

    logger.logRAG('Knowledge base updated', {
      userId,
      knowledgeBaseId: id,
      updates: Object.keys(updates),
    });

    res.json({
      success: true,
      data: updatedKB,
    });
  }),
);

/**
 * @swagger
 * /api/knowledge-base/{id}:
 *   delete:
 *     summary: Delete knowledge base
 *     description: Delete a knowledge base and all its documents
 *     tags: [Knowledge Base]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge base ID
 *     responses:
 *       200:
 *         description: Knowledge base deleted successfully
 *       404:
 *         description: Knowledge base not found
 */
router.delete('/:id', optionalAuth, validateKnowledgeBaseId, checkValidation, catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id || 'anonymous';

  // Get existing knowledge base
  const knowledgeBase = await cache.get(`kb:${id}`);

  if (!knowledgeBase) {
    throw new NotFoundError('Knowledge base');
  }

  // Check ownership
  if (knowledgeBase.userId !== userId && req.user.role !== 'admin') {
    throw new NotFoundError('Knowledge base');
  }

  // Delete from cache
  await cache.del(`kb:${id}`);
  await cache.del(`kb:name:${userId}:${knowledgeBase.name}`);

  // Clear list cache
  const listKeys = await cache.keys(`kb:list:${userId}:*`);
  if (listKeys.length > 0) {
    await Promise.all(listKeys.map((key) => cache.del(key)));
  }

  // TODO: Delete all documents and vectors from vector database

  logger.logRAG('Knowledge base deleted', {
    userId,
    knowledgeBaseId: id,
    name: knowledgeBase.name,
    documentCount: knowledgeBase.documentCount,
  });

  res.json({
    success: true,
    message: 'Knowledge base deleted successfully',
  });
}));

module.exports = router;
