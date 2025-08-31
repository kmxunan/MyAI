const KnowledgeBase = require('../models/KnowledgeBase');
const Document = require('../models/Document');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

/**
 * 知识库服务类
 * 负责知识库的管理和操作
 */
class KnowledgeBaseService {
  constructor() {
    this.stats = {
      knowledgeBasesCreated: 0,
      documentsAdded: 0,
      searchesPerformed: 0,
      totalSize: 0,
      errors: 0
    };
  }

  /**
   * 创建知识库
   */
  async createKnowledgeBase(data, userId) {
    try {
      this.validateKnowledgeBaseData(data);
      
      const knowledgeBase = new KnowledgeBase({
        ...data,
        owner: userId,
        createdBy: userId,
        updatedBy: userId
      });
      
      await knowledgeBase.save();
      
      this.stats.knowledgeBasesCreated++;
      logger.info(`Knowledge base created: ${knowledgeBase._id}`);
      
      return knowledgeBase;
    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to create knowledge base:', error);
      throw error;
    }
  }

  /**
   * 获取知识库列表
   */
  async getKnowledgeBases(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        category,
        isPublic,
        sortBy = 'updatedAt',
        sortOrder = 'desc'
      } = options;
      
      const query = {
        $or: [
          { owner: userId },
          { 'permissions.allowedUsers': userId },
          { 'permissions.isPublic': true }
        ],
        isActive: true
      };
      
      if (search) {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { tags: { $in: [new RegExp(search, 'i')] } }
          ]
        });
      }
      
      if (category) {
        query.category = category;
      }
      
      if (isPublic !== undefined) {
        query['permissions.isPublic'] = isPublic;
      }
      
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
      
      const skip = (page - 1) * limit;
      
      const [knowledgeBases, total] = await Promise.all([
        KnowledgeBase.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('owner', 'username email')
          .lean(),
        KnowledgeBase.countDocuments(query)
      ]);
      
      return {
        knowledgeBases,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get knowledge bases:', error);
      throw error;
    }
  }

  /**
   * 获取知识库详情
   */
  async getKnowledgeBase(id, userId) {
    try {
      const knowledgeBase = await KnowledgeBase.findOne({
        _id: id,
        $or: [
          { owner: userId },
          { 'permissions.allowedUsers': userId },
          { 'permissions.isPublic': true }
        ],
        isActive: true
      }).populate('owner', 'username email');
      
      if (!knowledgeBase) {
        throw new ValidationError('Knowledge base not found or access denied');
      }
      
      return knowledgeBase;
    } catch (error) {
      logger.error('Failed to get knowledge base:', error);
      throw error;
    }
  }

  /**
   * 更新知识库
   */
  async updateKnowledgeBase(id, data, userId) {
    try {
      const knowledgeBase = await KnowledgeBase.findOne({
        _id: id,
        $or: [
          { owner: userId },
          { 'permissions.allowedUsers': userId }
        ],
        isActive: true
      });
      
      if (!knowledgeBase) {
        throw new ValidationError('Knowledge base not found or access denied');
      }
      
      // 验证更新数据
      this.validateKnowledgeBaseData(data, true);
      
      // 更新字段
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && key !== '_id' && key !== 'owner') {
          knowledgeBase[key] = data[key];
        }
      });
      
      knowledgeBase.updatedBy = userId;
      knowledgeBase.updatedAt = new Date();
      
      await knowledgeBase.save();
      
      logger.info(`Knowledge base updated: ${id}`);
      return knowledgeBase;
    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to update knowledge base:', error);
      throw error;
    }
  }

  /**
   * 删除知识库
   */
  async deleteKnowledgeBase(id, userId) {
    try {
      const knowledgeBase = await KnowledgeBase.findOne({
        _id: id,
        owner: userId,
        isActive: true
      });
      
      if (!knowledgeBase) {
        throw new ValidationError('Knowledge base not found or access denied');
      }
      
      // 软删除
      knowledgeBase.isActive = false;
      knowledgeBase.deletedAt = new Date();
      knowledgeBase.updatedBy = userId;
      
      await knowledgeBase.save();
      
      // 同时软删除相关文档
      await Document.updateMany(
        { knowledgeBaseId: id },
        {
          isActive: false,
          deletedAt: new Date(),
          updatedBy: userId
        }
      );
      
      logger.info(`Knowledge base deleted: ${id}`);
      return { success: true };
    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to delete knowledge base:', error);
      throw error;
    }
  }

  /**
   * 添加文档到知识库
   */
  async addDocumentToKnowledgeBase(knowledgeBaseId, documentData, userId) {
    try {
      await this.getKnowledgeBase(knowledgeBaseId, userId);
      
      const document = new Document({
        ...documentData,
        knowledgeBaseId,
        userId,
        createdBy: userId,
        updatedBy: userId
      });
      
      await document.save();
      
      // 更新知识库统计信息
      await this.updateKnowledgeBaseStats(knowledgeBaseId);
      
      this.stats.documentsAdded++;
      logger.info(`Document added to knowledge base: ${document._id}`);
      
      return document;
    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to add document to knowledge base:', error);
      throw error;
    }
  }

  /**
   * 获取知识库文档列表
   */
  async getKnowledgeBaseDocuments(knowledgeBaseId, userId, options = {}) {
    try {
      await this.getKnowledgeBase(knowledgeBaseId, userId);
      
      const {
        page = 1,
        limit = 10,
        search,
        status,
        sortBy = 'updatedAt',
        sortOrder = 'desc'
      } = options;
      
      const query = {
        knowledgeBaseId,
        isActive: true
      };
      
      if (search) {
        query.$or = [
          { filename: { $regex: search, $options: 'i' } },
          { originalName: { $regex: search, $options: 'i' } },
          { 'metadata.title': { $regex: search, $options: 'i' } }
        ];
      }
      
      if (status) {
        query['processing.status'] = status;
      }
      
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
      
      const skip = (page - 1) * limit;
      
      const [documents, total] = await Promise.all([
        Document.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Document.countDocuments(query)
      ]);
      
      return {
        documents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get knowledge base documents:', error);
      throw error;
    }
  }

  /**
   * 从知识库移除文档
   */
  async removeDocumentFromKnowledgeBase(knowledgeBaseId, documentId, userId) {
    try {
      await this.getKnowledgeBase(knowledgeBaseId, userId);
      
      const document = await Document.findOne({
        _id: documentId,
        knowledgeBaseId,
        isActive: true
      });
      
      if (!document) {
        throw new ValidationError('Document not found in knowledge base');
      }
      
      // 软删除文档
      document.isActive = false;
      document.deletedAt = new Date();
      document.updatedBy = userId;
      
      await document.save();
      
      // 更新知识库统计信息
      await this.updateKnowledgeBaseStats(knowledgeBaseId);
      
      logger.info(`Document removed from knowledge base: ${documentId}`);
      return { success: true };
    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to remove document from knowledge base:', error);
      throw error;
    }
  }

  /**
   * 更新知识库统计信息
   */
  async updateKnowledgeBaseStats(knowledgeBaseId) {
    try {
      const stats = await Document.aggregate([
        {
          $match: {
            knowledgeBaseId: knowledgeBaseId,
            isActive: true
          }
        },
        {
          $group: {
            _id: null,
            documentCount: { $sum: 1 },
            totalSize: { $sum: '$fileInfo.size' },
            totalChunks: { $sum: '$chunking.chunkCount' }
          }
        }
      ]);
      
      const updateData = {
        'stats.documentCount': stats[0]?.documentCount || 0,
        'stats.totalSize': stats[0]?.totalSize || 0,
        'stats.chunkCount': stats[0]?.totalChunks || 0,
        updatedAt: new Date()
      };
      
      await KnowledgeBase.updateOne(
        { _id: knowledgeBaseId },
        { $set: updateData }
      );
      
    } catch (error) {
      logger.error('Failed to update knowledge base stats:', error);
    }
  }

  /**
   * 验证知识库数据
   */
  validateKnowledgeBaseData(data, isUpdate = false) {
    if (!isUpdate && !data.name) {
      throw new ValidationError('Knowledge base name is required');
    }
    
    if (data.name && (typeof data.name !== 'string' || data.name.trim().length === 0)) {
      throw new ValidationError('Knowledge base name must be a non-empty string');
    }
    
    if (data.description && typeof data.description !== 'string') {
      throw new ValidationError('Description must be a string');
    }
    
    if (data.category && typeof data.category !== 'string') {
      throw new ValidationError('Category must be a string');
    }
    
    if (data.tags && (!Array.isArray(data.tags) || !data.tags.every(tag => typeof tag === 'string'))) {
      throw new ValidationError('Tags must be an array of strings');
    }
    
    if (data.config) {
      this.validateKnowledgeBaseConfig(data.config);
    }
  }

  /**
   * 验证知识库配置
   */
  validateKnowledgeBaseConfig(config) {
    if (config.embeddingModel && typeof config.embeddingModel !== 'string') {
      throw new ValidationError('Embedding model must be a string');
    }
    
    if (config.chunkSize && (!Number.isInteger(config.chunkSize) || config.chunkSize < 100 || config.chunkSize > 2000)) {
      throw new ValidationError('Chunk size must be an integer between 100 and 2000');
    }
    
    if (config.chunkOverlap && (!Number.isInteger(config.chunkOverlap) || config.chunkOverlap < 0 || config.chunkOverlap > 500)) {
      throw new ValidationError('Chunk overlap must be an integer between 0 and 500');
    }
  }

  /**
   * 搜索知识库
   */
  async searchKnowledgeBases(query, userId, options = {}) {
    try {
      const { limit = 10 } = options;
      
      const searchQuery = {
        $or: [
          { owner: userId },
          { 'permissions.allowedUsers': userId },
          { 'permissions.isPublic': true }
        ],
        isActive: true,
        $and: [
          {
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { description: { $regex: query, $options: 'i' } },
              { tags: { $in: [new RegExp(query, 'i')] } }
            ]
          }
        ]
      };
      
      const knowledgeBases = await KnowledgeBase.find(searchQuery)
        .limit(limit)
        .sort({ updatedAt: -1 })
        .populate('owner', 'username email')
        .lean();
      
      this.stats.searchesPerformed++;
      
      return knowledgeBases;
    } catch (error) {
      logger.error('Failed to search knowledge bases:', error);
      throw error;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      knowledgeBasesCreated: 0,
      documentsAdded: 0,
      searchesPerformed: 0,
      totalSize: 0,
      errors: 0
    };
  }

  /**
   * 获取健康状态
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      stats: this.getStats()
    };
  }
}

module.exports = KnowledgeBaseService;