const express = require('express');
const {
  body,
  param,
  validationResult,
} = require('express-validator');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');
const {
  catchAsync,
  ValidationError,
  NotFoundError,
  VectorDBError,
} = require('../middleware/errorHandler');
const vectorService = require('../services/vectorService');
const Document = require('../models/Document');
// const { authorize, requirePermissions } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for search operations
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 search requests per windowMs
  message: {
    error: 'Too many search requests, please try again later.',
  },
});

const semanticSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 semantic searches per minute
  message: {
    error: 'Too many semantic search requests, please try again later.',
  },
});

router.use(searchLimiter);

/**
 * Validation middleware
 */
const validateKnowledgeBaseId = [
  param('knowledgeBaseId')
    .isMongoId()
    .withMessage('Invalid knowledge base ID'),
];

const validateSearchQuery = [
  body('query')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Query must be between 1 and 500 characters'),
  body('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  body('threshold')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Threshold must be between 0 and 1'),
  body('filters')
    .optional()
    .isObject()
    .withMessage('Filters must be an object'),
];

const validateHybridSearch = [
  body('query')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Query must be between 1 and 500 characters'),
  body('semanticWeight')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Semantic weight must be between 0 and 1'),
  body('keywordWeight')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Keyword weight must be between 0 and 1'),
  body('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
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
 * Search utilities
 */
const performKeywordSearch = async (searchQuery, knowledgeBaseId, options = {}) => {
  const { limit = 10 } = options;

  try {
    // Search documents using MongoDB text search
    const documents = await Document.find({
      knowledgeBaseId,
      isActive: true,
      isDeleted: false,
      $text: { $search: searchQuery },
    }, {
      score: { $meta: 'textScore' },
    })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit);

    // Format results to match expected structure
    const results = documents.map((doc) => {
      // Extract highlights from content (simple implementation)
      const content = doc.content || doc.filename;
      const queryWords = searchQuery.toLowerCase().split(' ');
      const highlights = queryWords.filter((word) => content.toLowerCase().includes(word));

      return {
        id: doc._id.toString(),
        documentId: doc._id.toString(),
        chunkId: 'chunk_0', // For document-level search
        content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
        title: doc.metadata?.title || doc.originalName || doc.filename,
        filename: doc.filename,
        score: doc.score || 0.8, // Use text search score or default
        highlights,
        metadata: {
          fileType: doc.fileType,
          size: doc.fileInfo?.size,
          pages: doc.metadata?.pages,
          createdAt: doc.createdAt,
        },
      };
    });

    return results;
  } catch (error) {
    logger.error('Keyword search failed', {
      error: error.message,
      searchQuery,
      knowledgeBaseId,
    });
    // Return empty results on error to prevent breaking hybrid search
    return [];
  }
};

const performSemanticSearch = async (searchQuery, knowledgeBaseId, options = {}) => {
  const { limit = 10, threshold = 0.7 } = options;

  try {
    // Use vector service to perform actual semantic search
    const results = await vectorService.searchVectors(searchQuery, knowledgeBaseId, limit);

    // Get document information for results
    const documentIds = [...new Set(results.map(r => r.documentId))];
    const documents = await Document.find({ _id: { $in: documentIds } }).select('title filename originalName');
    const documentMap = new Map(documents.map(doc => [doc._id.toString(), doc]));

    // Filter and format results
    const filteredResults = results
      .filter((result) => result.score >= threshold)
      .map((result) => {
        const document = documentMap.get(result.documentId);
        return {
          id: result.id,
          documentId: result.documentId,
          chunkId: `chunk_${result.chunkIndex}`,
          content: result.text,
          title: document?.title || document?.originalName || 'Unknown Document',
          filename: document?.filename || document?.originalName || 'unknown.pdf',
          score: result.score,
          embedding: null, // Don't return embeddings to client
          metadata: {
            chunkIndex: result.chunkIndex,
            createdAt: result.createdAt,
          },
        };
      });

    return filteredResults;
  } catch (error) {
    throw new VectorDBError('Semantic search failed', error.message);
  }
};

const performHybridSearch = async (searchQuery, knowledgeBaseId, options = {}) => {
  const {
    semanticWeight = 0.7,
    keywordWeight = 0.3,
    limit = 10,
    threshold = 0.5,
  } = options;

  // Perform both searches
  const [semanticResults, keywordResults] = await Promise.all([
    performSemanticSearch(searchQuery, knowledgeBaseId, { limit: limit * 2, threshold: 0.5 }),
    performKeywordSearch(searchQuery, knowledgeBaseId, { limit: limit * 2 }),
  ]);

  // Combine and rerank results
  const combinedResults = new Map();

  // Add semantic results
  semanticResults.forEach((result) => {
    const key = `${result.documentId}_${result.chunkId}`;
    combinedResults.set(key, {
      ...result,
      semanticScore: result.score,
      keywordScore: 0,
      combinedScore: result.score * semanticWeight,
    });
  });

  // Add keyword results and update scores
  keywordResults.forEach((result) => {
    const key = `${result.documentId}_${result.chunkId}`;
    if (combinedResults.has(key)) {
      const existing = combinedResults.get(key);
      existing.keywordScore = result.score;
      existing.combinedScore = (existing.semanticScore * semanticWeight) + (result.score * keywordWeight);
      existing.highlights = [...(existing.highlights || []), ...(result.highlights || [])];
    } else {
      combinedResults.set(key, {
        ...result,
        semanticScore: 0,
        keywordScore: result.score,
        combinedScore: result.score * keywordWeight,
      });
    }
  });

  // Sort by combined score and return top results
  return Array.from(combinedResults.values())
    .filter((result) => result.combinedScore >= threshold)
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit)
    .map((result) => ({
      ...result,
      score: result.combinedScore,
    }));
};

/**
 * @swagger
 * components:
 *   schemas:
 *     SearchResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Result ID
 *         documentId:
 *           type: string
 *           description: Source document ID
 *         chunkId:
 *           type: string
 *           description: Text chunk ID
 *         content:
 *           type: string
 *           description: Matched text content
 *         title:
 *           type: string
 *           description: Document title
 *         filename:
 *           type: string
 *           description: Source filename
 *         score:
 *           type: number
 *           description: Relevance score (0-1)
 *         highlights:
 *           type: array
 *           items:
 *             type: string
 *           description: Highlighted text snippets
 *         metadata:
 *           type: object
 *           description: Additional metadata
 *
 *     SearchRequest:
 *       type: object
 *       required:
 *         - query
 *       properties:
 *         query:
 *           type: string
 *           description: Search query
 *           minLength: 1
 *           maxLength: 500
 *         limit:
 *           type: integer
 *           description: Maximum number of results
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         threshold:
 *           type: number
 *           description: Minimum relevance score
 *           minimum: 0
 *           maximum: 1
 *           default: 0.7
 *         filters:
 *           type: object
 *           description: Additional filters
 */

/**
 * @swagger
 * /api/search/{knowledgeBaseId}/keyword:
 *   post:
 *     summary: Keyword search
 *     description: Perform keyword-based search in a knowledge base
 *     tags: [Search]
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
 *             $ref: '#/components/schemas/SearchRequest'
 *     responses:
 *       200:
 *         description: Search completed successfully
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
 *                     $ref: '#/components/schemas/SearchResult'
 *                 query:
 *                   type: string
 *                 searchType:
 *                   type: string
 *                   enum: [keyword]
 *                 resultCount:
 *                   type: integer
 *                 searchTime:
                   type: number
                   description: Search time in milliseconds
 */
router.post(
  '/:knowledgeBaseId/keyword',
  validateKnowledgeBaseId,
  validateSearchQuery,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId } = req.params;
    const { query, limit = 10, filters = {} } = req.body;
    const userId = req.user?.id || 'anonymous';
    const startTime = Date.now();

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user?.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Build cache key
    const cacheKey = `search:keyword:
    ${knowledgeBaseId}:${Buffer.from(query).toString('base64')}:${limit}:${JSON.stringify(filters)}`;

    // Try to get from cache
    let results = await cache.get(cacheKey);

    if (!results) {
      // Perform keyword search
      results = await performKeywordSearch(query, knowledgeBaseId, { limit, filters });

      // Cache for 10 minutes
      await cache.set(cacheKey, results, 600);
    }

    const searchTime = Date.now() - startTime;

    logger.logRAG('Keyword search performed', {
      userId,
      knowledgeBaseId,
      query: query.substring(0, 100),
      resultCount: results.length,
      searchTime,
    });

    res.json({
      success: true,
      data: results,
      query,
      searchType: 'keyword',
      resultCount: results.length,
      searchTime,
    });
  }),
);

/**
 * @swagger
 * /api/search/{knowledgeBaseId}/semantic:
 *   post:
 *     summary: Semantic search
 *     description: Perform semantic (vector) search in a knowledge base
 *     tags: [Search]
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
 *             $ref: '#/components/schemas/SearchRequest'
 *     responses:
 *       200:
 *         description: Search completed successfully
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
 *                     $ref: '#/components/schemas/SearchResult'
 *                 query:
 *                   type: string
 *                 searchType:
 *                   type: string
 *                   enum: [semantic]
 *                 resultCount:
 *                   type: integer
 *                 searchTime:
 *                   type: number
 */
router.post(
  '/:knowledgeBaseId/semantic',
  semanticSearchLimiter,
  validateKnowledgeBaseId,
  validateSearchQuery,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId } = req.params;
    const {
      query,
      limit = 10,
      threshold = 0.7,
      filters = {},
    } = req.body;
    const userId = req.user?.id || 'anonymous';
    const startTime = Date.now();

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Build cache key
    const cacheKey = `search:semantic:
    ${knowledgeBaseId}:${Buffer.from(query).toString('base64')}:${limit}:${threshold}:${JSON.stringify(filters)}`;

    // Try to get from cache
    let results = await cache.get(cacheKey);

    if (!results) {
      // Perform semantic search
      results = await performSemanticSearch(query, knowledgeBaseId, { limit, threshold, filters });

      // Cache for 10 minutes
      await cache.set(cacheKey, results, 600);
    }

    const searchTime = Date.now() - startTime;

    logger.logRAG('Semantic search performed', {
      userId,
      knowledgeBaseId,
      query: query.substring(0, 100),
      resultCount: results.length,
      searchTime,
      threshold,
    });

    res.json({
      success: true,
      data: results,
      query,
      searchType: 'semantic',
      resultCount: results.length,
      searchTime,
    });
  }),
);

/**
 * @swagger
 * /api/search/{knowledgeBaseId}/hybrid:
 *   post:
 *     summary: Hybrid search
 *     description: Perform hybrid search combining semantic and keyword search
 *     tags: [Search]
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
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: Search query
 *                 minLength: 1
 *                 maxLength: 500
 *               semanticWeight:
 *                 type: number
 *                 description: Weight for semantic search results
 *                 minimum: 0
 *                 maximum: 1
 *                 default: 0.7
 *               keywordWeight:
 *                 type: number
 *                 description: Weight for keyword search results
 *                 minimum: 0
 *                 maximum: 1
 *                 default: 0.3
 *               limit:
 *                 type: integer
 *                 description: Maximum number of results
 *                 minimum: 1
 *                 maximum: 50
 *                 default: 10
 *               threshold:
 *                 type: number
 *                 description: Minimum combined score
 *                 minimum: 0
 *                 maximum: 1
 *                 default: 0.5
 *     responses:
 *       200:
 *         description: Search completed successfully
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
 *                     allOf:
 *                       - $ref: '#/components/schemas/SearchResult'
 *                       - type: object
 *                         properties:
 *                           semanticScore:
 *                             type: number
 *                           keywordScore:
 *                             type: number
 *                           combinedScore:
 *                             type: number
 *                 query:
 *                   type: string
 *                 searchType:
 *                   type: string
 *                   enum: [hybrid]
 *                 resultCount:
 *                   type: integer
 *                 searchTime:
 *                   type: number
 *                 weights:
 *                   type: object
 *                   properties:
 *                     semantic:
 *                       type: number
 *                     keyword:
 *                       type: number
 */
router.post(
  '/:knowledgeBaseId/hybrid',
  semanticSearchLimiter,
  validateKnowledgeBaseId,
  validateHybridSearch,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId } = req.params;
    const {
      query,
      semanticWeight = 0.7,
      keywordWeight = 0.3,
      limit = 10,
      threshold = 0.5,
    } = req.body;
    const userId = req.user?.id || 'anonymous';
    const startTime = Date.now();

    // Validate weights sum to 1
    if (Math.abs(semanticWeight + keywordWeight - 1) > 0.001) {
      throw new ValidationError('Semantic weight and keyword weight must sum to 1');
    }

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Build cache key
    const cacheKey = `search:hybrid:
    ${knowledgeBaseId}:
    ${Buffer.from(query).toString('base64')}:
    ${semanticWeight}:
    ${keywordWeight}:
    ${limit}:
    ${threshold}`;

    // Try to get from cache
    let results = await cache.get(cacheKey);

    if (!results) {
      // Perform hybrid search
      results = await performHybridSearch(query, knowledgeBaseId, {
        semanticWeight,
        keywordWeight,
        limit,
        threshold,
      });

      // Cache for 10 minutes
      await cache.set(cacheKey, results, 600);
    }

    const searchTime = Date.now() - startTime;

    logger.logRAG('Hybrid search performed', {
      userId,
      knowledgeBaseId,
      query: query.substring(0, 100),
      resultCount: results.length,
      searchTime,
      semanticWeight,
      keywordWeight,
      threshold,
    });

    res.json({
      success: true,
      data: results,
      query,
      searchType: 'hybrid',
      resultCount: results.length,
      searchTime,
      weights: {
        semantic: semanticWeight,
        keyword: keywordWeight,
      },
    });
  }),
);

/**
 * @swagger
 * /api/search/{knowledgeBaseId}/suggestions:
 *   get:
 *     summary: Get search suggestions
 *     description: Get search query suggestions based on knowledge base content
 *     tags: [Search]
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
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Partial query for suggestions
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *         description: Maximum number of suggestions
 *     responses:
 *       200:
 *         description: Suggestions retrieved successfully
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
 *                       suggestion:
 *                         type: string
 *                       score:
 *                         type: number
 *                       type:
 *                         type: string
 *                         enum: [completion, related, popular]
 */
router.get(
  '/:knowledgeBaseId/suggestions',
  validateKnowledgeBaseId,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId } = req.params;
    const { q: query, limit = 5 } = req.query;
    const userId = req.user?.id || 'anonymous';

    if (!query || query.trim().length === 0) {
      throw new ValidationError('Query parameter q is required');
    }

    if (query.length > 100) {
      throw new ValidationError('Query must not exceed 100 characters');
    }

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Build cache key
    const cacheKey = `search:suggestions:
    ${knowledgeBaseId}:
    ${Buffer.from(query.toLowerCase()).toString('base64')}:
    ${limit}`;

    // Try to get from cache
    let suggestions = await cache.get(cacheKey);

    if (!suggestions) {
      // Generate suggestions (replace with actual implementation)
      suggestions = [
        {
          suggestion: `${query} documentation`,
          score: 0.9,
          type: 'completion',
        },
        {
          suggestion: `${query} examples`,
          score: 0.8,
          type: 'completion',
        },
        {
          suggestion: `how to ${query}`,
          score: 0.7,
          type: 'related',
        },
        {
          suggestion: `${query} best practices`,
          score: 0.6,
          type: 'related',
        },
        {
          suggestion: 'API reference',
          score: 0.5,
          type: 'popular',
        },
      ].slice(0, parseInt(limit, 10));

      // Cache for 1 hour
      await cache.set(cacheKey, suggestions, 3600);
    }

    logger.logRAG('Search suggestions generated', {
      userId,
      knowledgeBaseId,
      query,
      suggestionCount: suggestions.length,
    });

    res.json({
      success: true,
      data: suggestions,
    });
  }),
);

module.exports = router;
