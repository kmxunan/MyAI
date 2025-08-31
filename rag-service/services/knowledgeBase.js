const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { KnowledgeBaseError } = require('../middleware/errorHandler');
const vectorDBService = require('./vectorService');
const documentProcessor = require('./documentProcessor');
const searchService = require('./searchService');

// Knowledge Base Schema
const knowledgeBaseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  isPublic: {
    type: Boolean,
    default: false,
  },
  settings: {
    vectorSize: {
      type: Number,
      default: 1536,
    },
    distance: {
      type: String,
      enum: ['Cosine', 'Euclidean', 'Dot'],
      default: 'Cosine',
    },
    chunkSize: {
      type: Number,
      default: 1000,
    },
    chunkOverlap: {
      type: Number,
      default: 200,
    },
  },
  stats: {
    documentCount: {
      type: Number,
      default: 0,
    },
    vectorCount: {
      type: Number,
      default: 0,
    },
    totalSize: {
      type: Number,
      default: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map(),
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
knowledgeBaseSchema.index({ userId: 1, name: 1 }, { unique: true });
knowledgeBaseSchema.index({ isPublic: 1 });
knowledgeBaseSchema.index({ 'stats.lastUpdated': -1 });

// Virtual for collection name in vector DB
knowledgeBaseSchema.virtual('collectionName').get(function getCollectionName() {
  return `kb_${this._id.toString()}`;
});

// Document Schema
const documentSchema = new mongoose.Schema({
  knowledgeBaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KnowledgeBase',
    required: true,
    index: true,
  },
  filename: {
    type: String,
    required: true,
    trim: true,
  },
  originalName: {
    type: String,
    required: true,
    trim: true,
  },
  mimetype: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  chunks: [{
    text: String,
    index: Number,
    vectorId: String,
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
  }],
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
  },
  processingError: {
    type: String,
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map(),
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
}, {
  timestamps: true,
});

// Indexes
documentSchema.index({ knowledgeBaseId: 1, filename: 1 }, { unique: true });
documentSchema.index({ userId: 1 });
documentSchema.index({ status: 1 });

// Models
const KnowledgeBase = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
const Document = mongoose.model('Document', documentSchema);

class KnowledgeBaseService {
  constructor() {
    this.KnowledgeBase = KnowledgeBase;
    this.Document = Document;
  }

  /**
   * Create a new knowledge base
   */
  async createKnowledgeBase(data, userId) {
    try {
      const {
        name,
        description,
        isPublic = false,
        settings = {},
      } = data;

      // Check if knowledge base with same name exists for user
      const existing = await this.KnowledgeBase.findOne({ userId, name });
      if (existing) {
        throw new KnowledgeBaseError(`Knowledge base with name '${name}' already exists`);
      }

      // Create knowledge base document
      const knowledgeBase = new this.KnowledgeBase({
        name,
        description,
        userId,
        isPublic,
        settings: {
          vectorSize: settings.vectorSize || 1536,
          distance: settings.distance || 'Cosine',
          chunkSize: settings.chunkSize || 1000,
          chunkOverlap: settings.chunkOverlap || 200,
        },
      });

      await knowledgeBase.save();

      // Create vector collection
      await vectorDBService.createCollection(
        knowledgeBase.collectionName,
        knowledgeBase.settings.vectorSize,
        knowledgeBase.settings.distance,
      );

      logger.info('Knowledge base created', {
        id: knowledgeBase._id,
        name: knowledgeBase.name,
        userId,
        collectionName: knowledgeBase.collectionName,
      });

      return knowledgeBase;
    } catch (error) {
      logger.error('Failed to create knowledge base', {
        error: error.message,
        userId,
        name: data.name,
      });
      throw new KnowledgeBaseError(`Failed to create knowledge base: ${error.message}`);
    }
  }

  /**
   * Get knowledge bases for user
   */
  async getKnowledgeBases(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        includePublic = false,
        sortBy = 'updatedAt',
        sortOrder = 'desc',
      } = options;

      const query = { userId };

      // Include public knowledge bases if requested
      if (includePublic) {
        query.$or = [{ userId }, { isPublic: true }];
        delete query.userId;
      }

      // Add search filter
      if (search) {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
          ],
        });
      }

      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      const skip = (page - 1) * limit;

      const [knowledgeBases, total] = await Promise.all([
        this.KnowledgeBase.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        this.KnowledgeBase.countDocuments(query),
      ]);

      return {
        knowledgeBases,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get knowledge bases', {
        error: error.message,
        userId,
        options,
      });
      throw new KnowledgeBaseError(`Failed to get knowledge bases: ${error.message}`);
    }
  }

  /**
   * Get knowledge base by ID
   */
  async getKnowledgeBase(id, userId) {
    try {
      const knowledgeBase = await this.KnowledgeBase.findOne({
        _id: id,
        $or: [{ userId }, { isPublic: true }],
      });

      if (!knowledgeBase) {
        throw new KnowledgeBaseError('Knowledge base not found');
      }

      return knowledgeBase;
    } catch (error) {
      logger.error('Failed to get knowledge base', {
        error: error.message,
        id,
        userId,
      });
      throw new KnowledgeBaseError(`Failed to get knowledge base: ${error.message}`);
    }
  }

  /**
   * Update knowledge base
   */
  async updateKnowledgeBase(id, updates, userId) {
    try {
      const knowledgeBase = await this.KnowledgeBase.findOne({
        _id: id,
        userId, // Only owner can update
      });

      if (!knowledgeBase) {
        throw new KnowledgeBaseError('Knowledge base not found or access denied');
      }

      // Update allowed fields
      const allowedUpdates = ['name', 'description', 'isPublic', 'settings', 'metadata'];
      const updateData = {};

      allowedUpdates.forEach((field) => {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      });

      // Check for name uniqueness if name is being updated
      if (updateData.name && updateData.name !== knowledgeBase.name) {
        const existing = await this.KnowledgeBase.findOne({
          userId,
          name: updateData.name,
          _id: { $ne: id },
        });
        if (existing) {
          throw new KnowledgeBaseError(`Knowledge base with name '${updateData.name}' already exists`);
        }
      }

      const updatedKnowledgeBase = await this.KnowledgeBase.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true },
      );

      logger.info('Knowledge base updated', {
        id,
        userId,
        updates: Object.keys(updateData),
      });

      return updatedKnowledgeBase;
    } catch (error) {
      logger.error('Failed to update knowledge base', {
        error: error.message,
        id,
        userId,
        updates,
      });
      throw new KnowledgeBaseError(`Failed to update knowledge base: ${error.message}`);
    }
  }

  /**
   * Delete knowledge base
   */
  async deleteKnowledgeBase(id, userId) {
    try {
      const knowledgeBase = await this.KnowledgeBase.findOne({
        _id: id,
        userId, // Only owner can delete
      });

      if (!knowledgeBase) {
        throw new KnowledgeBaseError('Knowledge base not found or access denied');
      }

      // Delete vector collection
      try {
        await vectorDBService.deleteCollection(knowledgeBase.collectionName);
      } catch (error) {
        logger.warn('Failed to delete vector collection', {
          error: error.message,
          collectionName: knowledgeBase.collectionName,
        });
      }

      // Delete all documents
      await this.Document.deleteMany({ knowledgeBaseId: id });

      // Delete knowledge base
      await this.KnowledgeBase.findByIdAndDelete(id);

      logger.info('Knowledge base deleted', {
        id,
        name: knowledgeBase.name,
        userId,
        collectionName: knowledgeBase.collectionName,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete knowledge base', {
        error: error.message,
        id,
        userId,
      });
      throw new KnowledgeBaseError(`Failed to delete knowledge base: ${error.message}`);
    }
  }

  /**
   * Add document to knowledge base
   */
  async addDocument(knowledgeBaseId, file, userId, metadata = {}) {
    try {
      // Verify knowledge base exists and user has access
      const knowledgeBase = await this.getKnowledgeBase(knowledgeBaseId, userId);

      // Check if document with same filename already exists
      const existing = await this.Document.findOne({
        knowledgeBaseId,
        filename: file.filename,
      });
      if (existing) {
        throw new KnowledgeBaseError(`Document with filename '${file.filename}' already exists`);
      }

      // Create document record
      const document = new this.Document({
        knowledgeBaseId,
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        content: '', // Will be filled by document processor
        userId,
        metadata: new Map(Object.entries(metadata)),
      });

      await document.save();

      // Process document asynchronously
      this.processDocumentAsync(document, knowledgeBase, file);

      logger.info('Document added to knowledge base', {
        documentId: document._id,
        knowledgeBaseId,
        filename: file.filename,
        userId,
      });

      return document;
    } catch (error) {
      logger.error('Failed to add document to knowledge base', {
        error: error.message,
        knowledgeBaseId,
        filename: file?.filename,
        userId,
      });
      throw new KnowledgeBaseError(`Failed to add document: ${error.message}`);
    }
  }

  /**
   * Process document asynchronously
   */
  async processDocumentAsync(document, knowledgeBase, file) {
    try {
      // Process document content
      const result = await documentProcessor.processDocument(
        file,
        knowledgeBase.collectionName,
        {
          documentId: document._id.toString(),
          knowledgeBaseId: knowledgeBase._id.toString(),
          filename: document.filename,
          chunkSize: knowledgeBase.settings.chunkSize,
          chunkOverlap: knowledgeBase.settings.chunkOverlap,
        },
      );

      // Update document with processing results
      await this.Document.findByIdAndUpdate(document._id, {
        $set: {
          content: result.content,
          chunks: result.chunks.map((chunk, index) => ({
            text: chunk.text,
            index,
            vectorId: chunk.vectorId,
            metadata: new Map(Object.entries(chunk.metadata || {})),
          })),
          status: 'completed',
        },
      });

      // Update knowledge base stats
      await this.updateKnowledgeBaseStats(knowledgeBase._id);

      logger.info('Document processing completed', {
        documentId: document._id,
        knowledgeBaseId: knowledgeBase._id,
        chunksCount: result.chunks.length,
      });
    } catch (error) {
      // Update document with error status
      await this.Document.findByIdAndUpdate(document._id, {
        $set: {
          status: 'failed',
          processingError: error.message,
        },
      });

      logger.error('Document processing failed', {
        documentId: document._id,
        knowledgeBaseId: knowledgeBase._id,
        error: error.message,
      });
    }
  }

  /**
   * Get documents in knowledge base
   */
  async getDocuments(knowledgeBaseId, userId, options = {}) {
    try {
      // Verify access to knowledge base
      await this.getKnowledgeBase(knowledgeBaseId, userId);

      const {
        page = 1,
        limit = 20,
        search,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = options;

      const query = { knowledgeBaseId };

      // Add search filter
      if (search) {
        query.$or = [
          { filename: { $regex: search, $options: 'i' } },
          { originalName: { $regex: search, $options: 'i' } },
        ];
      }

      // Add status filter
      if (status) {
        query.status = status;
      }

      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      const skip = (page - 1) * limit;

      const [documents, total] = await Promise.all([
        this.Document.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .select('-content -chunks') // Exclude large fields
          .lean(),
        this.Document.countDocuments(query),
      ]);

      return {
        documents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get documents', {
        error: error.message,
        knowledgeBaseId,
        userId,
        options,
      });
      throw new KnowledgeBaseError(`Failed to get documents: ${error.message}`);
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(documentId, userId) {
    try {
      const document = await this.Document.findById(documentId);
      if (!document) {
        throw new KnowledgeBaseError('Document not found');
      }

      // Verify access to knowledge base
      await this.getKnowledgeBase(document.knowledgeBaseId, userId);

      return document;
    } catch (error) {
      logger.error('Failed to get document', {
        error: error.message,
        documentId,
        userId,
      });
      throw new KnowledgeBaseError(`Failed to get document: ${error.message}`);
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId, userId) {
    try {
      const document = await this.getDocument(documentId, userId);
      const knowledgeBase = await this.getKnowledgeBase(document.knowledgeBaseId, userId);

      // Delete vectors from vector DB
      if (document.chunks && document.chunks.length > 0) {
        const vectorIds = document.chunks
          .filter((chunk) => chunk.vectorId)
          .map((chunk) => chunk.vectorId);

        if (vectorIds.length > 0) {
          try {
            await vectorDBService.deleteVectorsByIds(
              knowledgeBase.collectionName,
              vectorIds,
            );
          } catch (error) {
            logger.warn('Failed to delete vectors', {
              error: error.message,
              documentId,
              vectorIds: vectorIds.length,
            });
          }
        }
      }

      // Delete document
      await this.Document.findByIdAndDelete(documentId);

      // Update knowledge base stats
      await this.updateKnowledgeBaseStats(document.knowledgeBaseId);

      logger.info('Document deleted', {
        documentId,
        knowledgeBaseId: document.knowledgeBaseId,
        filename: document.filename,
        userId,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete document', {
        error: error.message,
        documentId,
        userId,
      });
      throw new KnowledgeBaseError(`Failed to delete document: ${error.message}`);
    }
  }

  /**
   * Update knowledge base statistics
   */
  async updateKnowledgeBaseStats(knowledgeBaseId) {
    try {
      const [documentStats, vectorStats] = await Promise.all([
        this.Document.aggregate([
          { $match: { knowledgeBaseId: new mongoose.Types.ObjectId(knowledgeBaseId) } },
          {
            $group: {
              _id: null,
              documentCount: { $sum: 1 },
              totalSize: { $sum: '$size' },
              vectorCount: {
                $sum: {
                  $size: {
                    $ifNull: ['$chunks', []],
                  },
                },
              },
            },
          },
        ]),
        this.getVectorCollectionStats(knowledgeBaseId),
      ]);

      const stats = documentStats[0] || {
        documentCount: 0,
        totalSize: 0,
        vectorCount: 0,
      };

      // Use vector DB stats if available
      if (vectorStats && vectorStats.pointsCount !== undefined) {
        stats.vectorCount = vectorStats.pointsCount;
      }

      await this.KnowledgeBase.findByIdAndUpdate(knowledgeBaseId, {
        $set: {
          'stats.documentCount': stats.documentCount,
          'stats.vectorCount': stats.vectorCount,
          'stats.totalSize': stats.totalSize,
          'stats.lastUpdated': new Date(),
        },
      });

      return stats;
    } catch (error) {
      logger.error('Failed to update knowledge base stats', {
        error: error.message,
        knowledgeBaseId,
      });
      // Don't throw error as this is not critical
      return null;
    }
  }

  /**
   * Get vector collection statistics
   */
  async getVectorCollectionStats(knowledgeBaseId) {
    try {
      const knowledgeBase = await this.KnowledgeBase.findById(knowledgeBaseId);
      if (!knowledgeBase) {
        return null;
      }

      return await vectorDBService.getCollectionStats(knowledgeBase.collectionName);
    } catch (error) {
      logger.warn('Failed to get vector collection stats', {
        error: error.message,
        knowledgeBaseId,
      });
      return null;
    }
  }

  /**
   * Search in knowledge base
   */
  async search(knowledgeBaseId, query, userId, options = {}) {
    try {
      const knowledgeBase = await this.getKnowledgeBase(knowledgeBaseId, userId);

      // Use search service for vector search
      return await searchService.search(knowledgeBase.collectionName, query, options);
    } catch (error) {
      logger.error('Failed to search knowledge base', {
        error: error.message,
        knowledgeBaseId,
        query: query?.substring(0, 100),
        userId,
      });
      throw new KnowledgeBaseError(`Failed to search knowledge base: ${error.message}`);
    }
  }

  /**
   * Get knowledge base health status
   */
  async getHealthStatus() {
    try {
      const [dbStats, vectorDBStatus] = await Promise.all([
        this.getDatabaseStats(),
        vectorDBService.isHealthy(),
      ]);

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: dbStats,
        vectorDB: {
          connected: vectorDBStatus,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats() {
    try {
      const [kbCount, docCount] = await Promise.all([
        this.KnowledgeBase.countDocuments(),
        this.Document.countDocuments(),
      ]);

      return {
        knowledgeBasesCount: kbCount,
        documentsCount: docCount,
      };
    } catch (error) {
      logger.error('Failed to get database stats', {
        error: error.message,
      });
      return {
        error: error.message,
      };
    }
  }
}

// Create singleton instance
const knowledgeBaseService = new KnowledgeBaseService();

module.exports = {
  knowledgeBaseService,
  KnowledgeBase,
  Document,
};
