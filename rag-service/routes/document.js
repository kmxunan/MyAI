const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const {
  body,
  param,
  query,
  validationResult,
} = require('express-validator');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');
const vectorService = require('../services/vectorService');
const {
  catchAsync,
  ValidationError,
  NotFoundError,
  DocumentProcessingError,
  handleDocumentProcessingError,
} = require('../middleware/errorHandler');
// const { authorize, requirePermissions } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for document operations
const docLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 requests per windowMs
  message: {
    error: 'Too many document requests, please try again later.',
  },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 uploads per hour
  message: {
    error: 'Too many file uploads, please try again later.',
  },
});

router.use(docLimiter);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ValidationError(`File type ${file.mimetype} is not supported`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 5, // Maximum 5 files per request
  },
});

/**
 * Validation middleware
 */
const validateKnowledgeBaseId = [
  param('knowledgeBaseId')
    .isLength({ min: 1 })
    .withMessage('Knowledge base ID is required'),
];

const validateDocumentId = [
  param('documentId')
    .isLength({ min: 1 })
    .withMessage('Document ID is required'),
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

const validateDocumentMetadata = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each tag must be between 1 and 50 characters'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
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
 * Text chunking utility
 */
const chunkText = (text, chunkSize = 1000, overlap = 200) => {
  const chunks = [];
  const words = text.split(/\s+/);

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) {
      chunks.push({
        content: chunk,
        startIndex: i,
        endIndex: Math.min(i + chunkSize, words.length),
        wordCount: chunk.split(/\s+/).length,
      });
    }
  }

  return chunks;
};

/**
 * Document processing utilities
 */
const processDocument = async (file, _knowledgeBaseId) => {
  try {
    const ext = path.extname(file.originalname).toLowerCase();
    let content = '';

    switch (ext) {
    case '.txt':
    case '.md':
      content = await fs.readFile(file.path, 'utf-8');
      break;
    case '.pdf': {
      const pdfBuffer = await fs.readFile(file.path);
      const pdfData = await pdfParse(pdfBuffer);
      content = pdfData.text;
      break;
    }
    case '.docx': {
      const docxBuffer = await fs.readFile(file.path);
      const result = await mammoth.extractRawText({ buffer: docxBuffer });
      content = result.value;
      break;
    }
    case '.xlsx': {
      const workbook = XLSX.readFile(file.path);
      const sheets = [];
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const csvData = XLSX.utils.sheet_to_csv(worksheet);
        sheets.push(['Sheet:', sheetName, csvData].join('\n'));
      });
      content = sheets.join('\n\n');
      break;
    }
    case '.csv':
      content = await fs.readFile(file.path, 'utf-8');
      break;
    case '.json': {
      const jsonData = await fs.readFile(file.path, 'utf-8');
      content = JSON.stringify(JSON.parse(jsonData), null, 2);
      break;
    }
    default:
      throw new DocumentProcessingError(`Unsupported file type: ${ext}`);
    }

    // Generate text chunks
    const chunks = chunkText(content, 1000, 200);

    return {
      content,
      chunks,
      wordCount: content.split(/\s+/).length,
      characterCount: content.length,
    };
  } catch (error) {
    throw handleDocumentProcessingError(file.originalname, error);
  }
};

/**
 * @swagger
 * components:
 *   schemas:
 *     Document:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Document ID
 *         knowledgeBaseId:
 *           type: string
 *           description: Knowledge base ID
 *         title:
 *           type: string
 *           description: Document title
 *         filename:
 *           type: string
 *           description: Original filename
 *         fileType:
 *           type: string
 *           description: File MIME type
 *         fileSize:
 *           type: integer
 *           description: File size in bytes
 *         description:
 *           type: string
 *           description: Document description
 *         content:
 *           type: string
 *           description: Extracted text content
 *         wordCount:
 *           type: integer
 *           description: Number of words
 *         characterCount:
 *           type: integer
 *           description: Number of characters
 *         chunkCount:
 *           type: integer
 *           description: Number of text chunks
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         metadata:
 *           type: object
 *           description: Additional metadata
 *         status:
 *           type: string
 *           enum: [processing, ready, error]
 *         processingError:
 *           type: string
 *           description: Error message if processing failed
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/documents/{knowledgeBaseId}:
 *   get:
 *     summary: Get documents in knowledge base
 *     description: Retrieve all documents in a specific knowledge base
 *     tags: [Documents]
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
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query for document title or content
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated list of tags to filter by
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [processing, ready, error]
 *         description: Filter by processing status
 *     responses:
 *       200:
 *         description: Documents retrieved successfully
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
 *                     $ref: '#/components/schemas/Document'
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
  '/:knowledgeBaseId',
  validateKnowledgeBaseId,
  validatePagination,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId } = req.params;
    const {
      page = 1,
      limit = 10,
      search,
      tags,
      status,
    } = req.query;
    const userId = req.user?.id || 'anonymous';

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user?.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Build cache key
    const cacheKey = `docs:list:${knowledgeBaseId}:${page}:${limit}:${search || ''}:${tags || ''}:${status || ''}`;

    // Try to get from cache
    let result = await cache.get(cacheKey);

    if (!result) {
      // Simulate database query (replace with actual implementation)
      const mockDocuments = [
        {
          id: '507f1f77bcf86cd799439013',
          knowledgeBaseId,
          title: 'API Documentation',
          filename: 'api-docs.pdf',
          fileType: 'application/pdf',
          fileSize: 1024000,
          description: 'Complete API documentation for the platform',
          wordCount: 5000,
          characterCount: 30000,
          chunkCount: 15,
          tags: ['api', 'documentation', 'reference'],
          metadata: {
            author: 'Technical Team',
            version: '1.0',
          },
          status: 'ready',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      result = {
        data: mockDocuments,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: mockDocuments.length,
          pages: Math.ceil(mockDocuments.length / limit),
        },
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, result, 300);
    }

    logger.logRAG('Documents retrieved', {
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
 * /api/documents/{knowledgeBaseId}/upload:
 *   post:
 *     summary: Upload documents to knowledge base
 *     description: Upload one or more documents to a knowledge base
 *     tags: [Documents]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Documents to upload (max 5 files, 50MB each)
 *               title:
 *                 type: string
 *                 description: Custom title for the document(s)
 *               description:
 *                 type: string
 *                 description: Description for the document(s)
 *               tags:
 *                 type: string
 *                 description: Comma-separated list of tags
 *               metadata:
 *                 type: string
 *                 description: JSON string of additional metadata
 *     responses:
 *       201:
 *         description: Documents uploaded successfully
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
 *                     $ref: '#/components/schemas/Document'
 *       400:
 *         description: Validation error or file processing error
 *       404:
 *         description: Knowledge base not found
 */
router.post(
  '/:knowledgeBaseId/upload',
  uploadLimiter,
  validateKnowledgeBaseId,
  checkValidation,
  upload.array('files', 5),
  validateDocumentMetadata,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId } = req.params;
    const {
      title,
      description,
      tags,
      metadata,
    } = req.body;
    const { files } = req;
    const userId = req.user?.id || 'anonymous';

    if (!files || files.length === 0) {
      throw new ValidationError('No files uploaded');
    }

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user?.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    const uploadedDocuments = [];
    const processingErrors = [];

    // Process each file
    const fileProcessingPromises = files.map(async (file) => {
      try {
        logger.logRAG('Processing document', {
          userId,
          knowledgeBaseId,
          filename: file.originalname,
          fileSize: file.size,
        });
        // Process document content
        const processedData = await processDocument(file, knowledgeBaseId);
        // Create document record
        const document = {
          id: `507f1f77bcf86cd79943901${Math.floor(Math.random() * 1000)}`,
          knowledgeBaseId,
          title: title || path.basename(file.originalname, path.extname(file.originalname)),
          filename: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          filePath: file.path,
          description: description || '',
          content: processedData.content,
          wordCount: processedData.wordCount,
          characterCount: processedData.characterCount,
          chunkCount: processedData.chunks.length,
          tags: tags ? tags.split(',').map((tag) => tag.trim()) : [],
          metadata: metadata ? JSON.parse(metadata) : {},
          status: 'ready',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        // Cache document
        await cache.set(`doc:${document.id}`, document, 3600);

        // Generate and store embeddings
        try {
          await vectorService.generateEmbeddings(processedData.chunks, document.id, knowledgeBaseId);
        } catch (embeddingError) {
          logger.logError('Failed to generate embeddings', embeddingError, {
            documentId: document.id,
            filename: file.originalname,
          });
          // Continue without embeddings for now
        }
        logger.logRAG('Document processed successfully', {
          userId,
          knowledgeBaseId,
          documentId: document.id,
          filename: file.originalname,
          wordCount: document.wordCount,
          chunkCount: document.chunkCount,
        });
        return { success: true, document };
      } catch (error) {
        logger.logError('Document processing failed', error, {
          userId,
          knowledgeBaseId,
          filename: file.originalname,
        });
        // Clean up file on error
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          logger.logError('Failed to clean up file', unlinkError, {
            filePath: file.path,
          });
        }
        return {
          success: false,
          error: {
            filename: file.originalname,
            error: error.message,
          },
        };
      }
    });

    const results = await Promise.all(fileProcessingPromises);

    results.forEach((result) => {
      if (result.success) {
        uploadedDocuments.push(result.document);
      } else {
        processingErrors.push(result.error);
      }
    });

    // Clear documents list cache
    const listKeys = await cache.keys(`docs:list:${knowledgeBaseId}:*`);
    if (listKeys.length > 0) {
      await Promise.all(listKeys.map((key) => cache.del(key)));
    }

    // Update knowledge base document count
    if (uploadedDocuments.length > 0) {
      knowledgeBase.documentCount += uploadedDocuments.length;
      knowledgeBase.totalSize += uploadedDocuments.reduce((sum, doc) => sum + doc.fileSize, 0);
      knowledgeBase.updatedAt = new Date().toISOString();
      await cache.set(`kb:${knowledgeBaseId}`, knowledgeBase, 3600);
    }

    const response = {
      success: true,
      data: uploadedDocuments,
      uploaded: uploadedDocuments.length,
      total: files.length,
    };

    if (processingErrors.length > 0) {
      response.errors = processingErrors;
      response.message = `${uploadedDocuments.length} of ${files.length} documents uploaded successfully`;
    }

    res.status(201).json(response);
  }),
);

/**
 * @swagger
 * /api/documents/{knowledgeBaseId}/{documentId}:
 *   get:
 *     summary: Get document by ID
 *     description: Retrieve a specific document by its ID
 *     tags: [Documents]
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
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Document'
 *       404:
 *         description: Document not found
 */
router.get(
  '/:knowledgeBaseId/:documentId',
  validateKnowledgeBaseId,
  validateDocumentId,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId, documentId } = req.params;
    const userId = req.user?.id || 'anonymous';

    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }

    // Get document
    const document = await cache.get(`doc:${documentId}`);
    if (!document || document.knowledgeBaseId !== knowledgeBaseId) {
      throw new NotFoundError('Document');
    }

    logger.logRAG('Document retrieved', {
      userId,
      knowledgeBaseId,
      documentId,
    });

    res.json({
      success: true,
      data: document,
    });
  }),
);

/**
 * @swagger
 * /api/documents/{knowledgeBaseId}/{documentId}:
 *   delete:
 *     summary: Delete document
 *     description: Delete a document from the knowledge base
 *     tags: [Documents]
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
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       404:
 *         description: Document not found
 */
router.delete(
  '/:knowledgeBaseId/:documentId',
  validateKnowledgeBaseId,
  validateDocumentId,
  checkValidation,
  catchAsync(async (req, res) => {
    const { knowledgeBaseId, documentId } = req.params;
    const userId = req.user?.id || 'anonymous';
    // Check if knowledge base exists and user has access
    const knowledgeBase = await cache.get(`kb:${knowledgeBaseId}`);
    if (!knowledgeBase || (knowledgeBase.userId !== userId && req.user.role !== 'admin')) {
      throw new NotFoundError('Knowledge base');
    }
    // Get document
    const document = await cache.get(`doc:${documentId}`);
    if (!document || document.knowledgeBaseId !== knowledgeBaseId) {
      throw new NotFoundError('Document');
    }
    // Delete file from disk
    if (document.filePath) {
      try {
        await fs.unlink(document.filePath);
      } catch (error) {
        logger.logError('Failed to delete file from disk', error, {
          filePath: document.filePath,
        });
      }
    }
    // Delete from cache
    await cache.del(`doc:${documentId}`);
    // Clear documents list cache
    const listKeys = await cache.keys(`docs:list:${knowledgeBaseId}:*`);
    if (listKeys.length > 0) {
      await Promise.all(listKeys.map((key) => cache.del(key)));
    }
    // Update knowledge base document count
    knowledgeBase.documentCount = Math.max(0, knowledgeBase.documentCount - 1);
    knowledgeBase.totalSize = Math.max(0, knowledgeBase.totalSize - document.fileSize);
    knowledgeBase.updatedAt = new Date().toISOString();
    await cache.set(`kb:${knowledgeBaseId}`, knowledgeBase, 3600);
    // Delete vectors from vector database
    try {
      await vectorService.deleteDocumentVectors(documentId, knowledgeBaseId);
    } catch (vectorError) {
      logger.logError('Failed to delete vectors', vectorError, {
        documentId,
        knowledgeBaseId,
      });
      // Continue with deletion even if vector cleanup fails
    }
    logger.logRAG('Document deleted', {
      userId,
      knowledgeBaseId,
      documentId,
      filename: document.filename,
    });
    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  }),
);

module.exports = router;
