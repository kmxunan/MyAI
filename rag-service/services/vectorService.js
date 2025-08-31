const { QdrantVectorStore } = require('@qdrant/js-client-rest');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class VectorService {
  constructor() {
    this.client = null;
    this.config = {
      host: process.env.QDRANT_HOST || 'localhost',
      port: parseInt(process.env.QDRANT_PORT, 10) || 6333,
      apiKey: process.env.QDRANT_API_KEY,
      timeout: parseInt(process.env.QDRANT_TIMEOUT, 10) || 30000,
      
      // 默认向量配置
      defaultVectorSize: parseInt(process.env.DEFAULT_VECTOR_SIZE, 10) || 1536,
      defaultDistance: process.env.DEFAULT_DISTANCE || 'Cosine',
      
      // 性能配置
      batchSize: parseInt(process.env.VECTOR_BATCH_SIZE, 10) || 100,
      maxRetries: parseInt(process.env.VECTOR_MAX_RETRIES, 10) || 3,
      retryDelay: parseInt(process.env.VECTOR_RETRY_DELAY, 10) || 1000,
    };
    
    // 连接状态
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
    
    // 统计信息
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      avgResponseTime: 0,
      collectionsCreated: 0,
      vectorsInserted: 0,
      vectorsSearched: 0,
    };
  }

  /**
   * 初始化向量数据库连接
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logger.info('Initializing vector service connection', {
        host: this.config.host,
        port: this.config.port,
      });
      
      // 创建Qdrant客户端
      this.client = new QdrantVectorStore({
        url: `http://${this.config.host}:${this.config.port}`,
        apiKey: this.config.apiKey,
        timeout: this.config.timeout,
      });
      
      // 测试连接
      await this.testConnection();
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      logger.info('Vector service initialized successfully');
    } catch (error) {
      this.connectionAttempts++;
      this.isConnected = false;
      
      logger.error('Failed to initialize vector service', {
        error: error.message,
        attempts: this.connectionAttempts,
      });
      
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        const delay = this.config.retryDelay * this.connectionAttempts;
        logger.info(`Retrying connection in ${delay}ms`);
        
        setTimeout(() => {
          this.initialize();
        }, delay);
      } else {
        throw new AppError('Failed to connect to vector database after maximum attempts', 500);
      }
    }
  }

  /**
   * 测试数据库连接
   * @returns {Promise<void>}
   */
  async testConnection() {
    try {
      await this.client.getCollections();
      logger.info('Vector database connection test successful');
    } catch (error) {
      logger.error('Vector database connection test failed', { error: error.message });
      throw error;
    }
  }

  /**
   * 创建集合
   * @param {string} collectionName - 集合名称
   * @param {Object} options - 创建选项
   * @returns {Promise<Object>} 创建结果
   */
  async createCollection(collectionName, options = {}) {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      this.validateCollectionName(collectionName);
      
      const config = {
        vectors: {
          size: options.vectorSize || this.config.defaultVectorSize,
          distance: options.distance || this.config.defaultDistance,
        },
        optimizers_config: {
          default_segment_number: options.segmentNumber || 2,
        },
        replication_factor: options.replicationFactor || 1,
      };
      
      // 检查集合是否已存在
      const exists = await this.collectionExists(collectionName);
      if (exists) {
        logger.warn('Collection already exists', { collectionName });
        return { success: true, existed: true };
      }
      
      // 创建集合
      await this.client.createCollection(collectionName, config);
      
      this.stats.collectionsCreated++;
      this.updateStats(startTime, true);
      
      logger.info('Collection created successfully', {
        collectionName,
        config,
        responseTime: Date.now() - startTime,
      });
      
      return { success: true, existed: false };
    } catch (error) {
      this.updateStats(startTime, false);
      logger.error('Failed to create collection', {
        error: error.message,
        collectionName,
        responseTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * 检查集合是否存在
   * @param {string} collectionName - 集合名称
   * @returns {Promise<boolean>} 是否存在
   */
  async collectionExists(collectionName) {
    try {
      const collections = await this.client.getCollections();
      return collections.collections.some(col => col.name === collectionName);
    } catch (error) {
      logger.error('Failed to check collection existence', {
        error: error.message,
        collectionName,
      });
      return false;
    }
  }

  /**
   * 插入向量
   * @param {string} collectionName - 集合名称
   * @param {Array} vectors - 向量数据
   * @returns {Promise<Object>} 插入结果
   */
  async insertVectors(collectionName, vectors) {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      this.validateCollectionName(collectionName);
      this.validateVectors(vectors);
      
      // 确保集合存在
      const exists = await this.collectionExists(collectionName);
      if (!exists) {
        await this.createCollection(collectionName);
      }
      
      // 批量插入
      const results = [];
      for (let i = 0; i < vectors.length; i += this.config.batchSize) {
        const batch = vectors.slice(i, i + this.config.batchSize);
        const batchResult = await this.insertBatch(collectionName, batch);
        results.push(batchResult);
      }
      
      const totalInserted = results.reduce((sum, result) => sum + result.count, 0);
      this.stats.vectorsInserted += totalInserted;
      this.updateStats(startTime, true);
      
      logger.info('Vectors inserted successfully', {
        collectionName,
        totalVectors: vectors.length,
        totalInserted,
        batches: results.length,
        responseTime: Date.now() - startTime,
      });
      
      return {
        success: true,
        totalVectors: vectors.length,
        totalInserted,
        batches: results.length,
      };
    } catch (error) {
      this.updateStats(startTime, false);
      logger.error('Failed to insert vectors', {
        error: error.message,
        collectionName,
        vectorCount: vectors.length,
        responseTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * 插入单个批次
   * @param {string} collectionName - 集合名称
   * @param {Array} batch - 批次数据
   * @returns {Promise<Object>} 插入结果
   */
  async insertBatch(collectionName, batch) {
    try {
      const points = batch.map((vector, index) => ({
        id: vector.id || `${Date.now()}_${index}`,
        vector: vector.vector || vector.embedding,
        payload: vector.metadata || vector.payload || {},
      }));
      
      await this.client.upsert(collectionName, {
        wait: true,
        points,
      });
      
      return { count: points.length };
    } catch (error) {
      logger.error('Failed to insert batch', {
        error: error.message,
        collectionName,
        batchSize: batch.length,
      });
      throw error;
    }
  }

  /**
   * 搜索向量
   * @param {Object} options - 搜索选项
   * @returns {Promise<Object>} 搜索结果
   */
  async search(options) {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      this.validateSearchOptions(options);
      
      const {
        vector,
        collectionName,
        limit = 10,
        scoreThreshold = 0.0,
        filter = {},
        withPayload = true,
        withVector = false,
      } = options;
      
      // 执行搜索
      const searchResult = await this.client.search(collectionName, {
        vector,
        limit,
        score_threshold: scoreThreshold,
        filter,
        with_payload: withPayload,
        with_vector: withVector,
      });
      
      // 转换结果格式
      const results = searchResult.map(result => ({
        id: result.id,
        score: result.score,
        content: result.payload?.content || '',
        metadata: result.payload || {},
        vector: withVector ? result.vector : undefined,
      }));
      
      this.stats.vectorsSearched += results.length;
      this.updateStats(startTime, true);
      
      logger.info('Vector search completed', {
        collectionName,
        resultCount: results.length,
        limit,
        scoreThreshold,
        responseTime: Date.now() - startTime,
      });
      
      return {
        results,
        totalResults: results.length,
        searchTime: Date.now() - startTime,
      };
    } catch (error) {
      this.updateStats(startTime, false);
      logger.error('Vector search failed', {
        error: error.message,
        collectionName: options.collectionName,
        responseTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * 删除向量
   * @param {string} collectionName - 集合名称
   * @param {Array|string} ids - 向量ID或ID数组
   * @returns {Promise<Object>} 删除结果
   */
  async deleteVectors(collectionName, ids) {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      this.validateCollectionName(collectionName);
      
      const vectorIds = Array.isArray(ids) ? ids : [ids];
      
      await this.client.delete(collectionName, {
        wait: true,
        points: vectorIds,
      });
      
      this.updateStats(startTime, true);
      
      logger.info('Vectors deleted successfully', {
        collectionName,
        deletedCount: vectorIds.length,
        responseTime: Date.now() - startTime,
      });
      
      return {
        success: true,
        deletedCount: vectorIds.length,
      };
    } catch (error) {
      this.updateStats(startTime, false);
      logger.error('Failed to delete vectors', {
        error: error.message,
        collectionName,
        idsCount: Array.isArray(ids) ? ids.length : 1,
        responseTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * 删除集合
   * @param {string} collectionName - 集合名称
   * @returns {Promise<Object>} 删除结果
   */
  async deleteCollection(collectionName) {
    const startTime = Date.now();
    
    try {
      this.validateConnection();
      this.validateCollectionName(collectionName);
      
      await this.client.deleteCollection(collectionName);
      
      this.updateStats(startTime, true);
      
      logger.info('Collection deleted successfully', {
        collectionName,
        responseTime: Date.now() - startTime,
      });
      
      return { success: true };
    } catch (error) {
      this.updateStats(startTime, false);
      logger.error('Failed to delete collection', {
        error: error.message,
        collectionName,
        responseTime: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * 获取集合信息
   * @param {string} collectionName - 集合名称
   * @returns {Promise<Object>} 集合信息
   */
  async getCollectionInfo(collectionName) {
    try {
      this.validateConnection();
      this.validateCollectionName(collectionName);
      
      const info = await this.client.getCollection(collectionName);
      
      return {
        name: collectionName,
        vectorsCount: info.vectors_count || 0,
        indexedVectorsCount: info.indexed_vectors_count || 0,
        pointsCount: info.points_count || 0,
        segmentsCount: info.segments_count || 0,
        config: info.config || {},
        status: info.status || 'unknown',
      };
    } catch (error) {
      logger.error('Failed to get collection info', {
        error: error.message,
        collectionName,
      });
      throw error;
    }
  }

  /**
   * 验证连接状态
   */
  validateConnection() {
    if (!this.isConnected || !this.client) {
      throw new AppError('Vector database is not connected', 503);
    }
  }

  /**
   * 验证集合名称
   * @param {string} collectionName - 集合名称
   */
  validateCollectionName(collectionName) {
    if (!collectionName || typeof collectionName !== 'string') {
      throw new AppError('Collection name is required and must be a string', 400);
    }
    
    if (collectionName.length > 255) {
      throw new AppError('Collection name is too long (max 255 characters)', 400);
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(collectionName)) {
      throw new AppError('Collection name contains invalid characters', 400);
    }
  }

  /**
   * 验证向量数据
   * @param {Array} vectors - 向量数组
   */
  validateVectors(vectors) {
    if (!Array.isArray(vectors) || vectors.length === 0) {
      throw new AppError('Vectors must be a non-empty array', 400);
    }
    
    vectors.forEach((vector, index) => {
      if (!vector.vector && !vector.embedding) {
        throw new AppError(`Vector at index ${index} is missing vector data`, 400);
      }
      
      const vectorData = vector.vector || vector.embedding;
      if (!Array.isArray(vectorData)) {
        throw new AppError(`Vector at index ${index} must be an array`, 400);
      }
      
      if (vectorData.length !== this.config.defaultVectorSize) {
        throw new AppError(
          `Vector at index ${index} has incorrect dimensions (expected ${this.config.defaultVectorSize}, got ${vectorData.length})`,
          400
        );
      }
    });
  }

  /**
   * 验证搜索选项
   * @param {Object} options - 搜索选项
   */
  validateSearchOptions(options) {
    if (!options || typeof options !== 'object') {
      throw new AppError('Search options are required', 400);
    }
    
    if (!options.vector || !Array.isArray(options.vector)) {
      throw new AppError('Search vector is required and must be an array', 400);
    }
    
    if (!options.collectionName) {
      throw new AppError('Collection name is required for search', 400);
    }
    
    if (options.limit && (options.limit < 1 || options.limit > 1000)) {
      throw new AppError('Search limit must be between 1 and 1000', 400);
    }
  }

  /**
   * 更新统计信息
   * @param {number} startTime - 开始时间
   * @param {boolean} success - 是否成功
   */
  updateStats(startTime, success) {
    this.stats.totalOperations++;
    
    if (success) {
      this.stats.successfulOperations++;
    } else {
      this.stats.failedOperations++;
    }
    
    const responseTime = Date.now() - startTime;
    this.stats.avgResponseTime = (
      (this.stats.avgResponseTime * (this.stats.totalOperations - 1) + responseTime) /
      this.stats.totalOperations
    );
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalOperations > 0 ?
        (this.stats.successfulOperations / this.stats.totalOperations) * 100 : 0,
      isConnected: this.isConnected,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      avgResponseTime: 0,
      collectionsCreated: 0,
      vectorsInserted: 0,
      vectorsSearched: 0,
    };
  }

  /**
   * 获取健康状态
   * @returns {Promise<Object>} 健康状态
   */
  async getHealthStatus() {
    try {
      if (!this.isConnected) {
        return {
          status: 'unhealthy',
          error: 'Not connected to vector database',
          timestamp: new Date().toISOString(),
        };
      }
      
      // 测试连接
      await this.testConnection();
      
      return {
        status: 'healthy',
        stats: this.getStats(),
        config: {
          host: this.config.host,
          port: this.config.port,
          defaultVectorSize: this.config.defaultVectorSize,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * 关闭连接
   * @returns {Promise<void>}
   */
  async close() {
    try {
      if (this.client) {
        // Qdrant客户端通常不需要显式关闭
        this.client = null;
      }
      
      this.isConnected = false;
      logger.info('Vector service connection closed');
    } catch (error) {
      logger.error('Error closing vector service connection', { error: error.message });
    }
  }
}

// 创建单例实例
const vectorService = new VectorService();

module.exports = vectorService;