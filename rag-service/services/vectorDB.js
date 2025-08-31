const { QdrantClient } = require('@qdrant/js-client-rest');
const logger = require('../utils/logger');
const { VectorDBError } = require('../middleware/errorHandler');

class VectorDBService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.config = {
      url: process.env.QDRANT_URL || 'http://127.0.0.1:6333',
      apiKey: process.env.QDRANT_API_KEY,
      timeout: parseInt(process.env.QDRANT_TIMEOUT, 10) || 30000,
    };
  }

  /**
   * Initialize connection to Qdrant
   */
  async connect() {
    try {
      logger.info('Attempting to connect to Qdrant', {
        url: this.config.url,
        timeout: this.config.timeout,
        hasApiKey: !!this.config.apiKey,
      });

      this.client = new QdrantClient({
        url: this.config.url,
        apiKey: this.config.apiKey,
        timeout: this.config.timeout,
        checkCompatibility: false, // Skip version compatibility check
      });

      // Test connection
      const collections = await this.client.getCollections();
      this.isConnected = true;

      logger.info('Successfully connected to Qdrant', {
        url: this.config.url,
        timeout: this.config.timeout,
        collectionsCount: collections.collections?.length || 0,
      });

      return true;
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect to Qdrant', {
        url: this.config.url,
        timeout: this.config.timeout,
        errorMessage: error.message,
        errorCode: error.code,
        errorStack: error.stack,
      });
      throw new VectorDBError('Failed to connect to vector database', error.message);
    }
  }

  /**
   * Disconnect from Qdrant
   */
  async disconnect() {
    try {
      if (this.client) {
        // Qdrant client doesn't have explicit disconnect method
        this.client = null;
        this.isConnected = false;
        logger.logVectorDB('Disconnected from Qdrant');
      }
    } catch (error) {
      logger.logError('Error disconnecting from Qdrant', error);
    }
  }

  /**
   * Check if connected to Qdrant
   */
  async isHealthy() {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }

      await this.client.getCollections();
      return true;
    } catch (error) {
      logger.logError('Qdrant health check failed', error);
      return false;
    }
  }

  /**
   * Create a collection for a knowledge base
   */
  async createCollection(knowledgeBaseId, vectorSize = 1536, distance = 'Cosine') {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const collectionName = `kb_${knowledgeBaseId}`;

      // Check if collection already exists
      const collections = await this.client.getCollections();
      const existingCollection = collections.collections.find(
        (col) => col.name === collectionName,
      );

      if (existingCollection) {
        logger.logVectorDB('Collection already exists', {
          knowledgeBaseId,
          collectionName,
        });
        return collectionName;
      }

      // Create collection
      await this.client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance,
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });

      logger.logVectorDB('Collection created', {
        knowledgeBaseId,
        collectionName,
        vectorSize,
        distance,
      });

      return collectionName;
    } catch (error) {
      logger.logError('Failed to create collection', error, {
        knowledgeBaseId,
        vectorSize,
        distance,
      });
      throw new VectorDBError('Failed to create collection', error.message);
    }
  }

  /**
   * Delete a collection
   */
  async deleteCollection(knowledgeBaseId) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const collectionName = `kb_${knowledgeBaseId}`;

      // Check if collection exists
      const collections = await this.client.getCollections();
      const existingCollection = collections.collections.find(
        (col) => col.name === collectionName,
      );

      if (!existingCollection) {
        logger.logVectorDB('Collection does not exist', {
          knowledgeBaseId,
          collectionName,
        });
        return true;
      }

      // Delete collection
      await this.client.deleteCollection(collectionName);

      logger.logVectorDB('Collection deleted', {
        knowledgeBaseId,
        collectionName,
      });

      return true;
    } catch (error) {
      logger.logError('Failed to delete collection', error, {
        knowledgeBaseId,
      });
      throw new VectorDBError('Failed to delete collection', error.message);
    }
  }

  /**
   * Insert vectors into collection
   */
  async insertVectors(knowledgeBaseId, vectors) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const collectionName = `kb_${knowledgeBaseId}`;

      // Prepare points for insertion
      const points = vectors.map((vector, index) => ({
        id: vector.id || `${Date.now()}_${index}`,
        vector: vector.embedding,
        payload: {
          documentId: vector.documentId,
          chunkId: vector.chunkId,
          content: vector.content,
          title: vector.title,
          filename: vector.filename,
          metadata: vector.metadata || {},
          createdAt: new Date().toISOString(),
        },
      }));

      // Insert points in batches
      const batchSize = 100;
      const totalBatches = Math.ceil(points.length / batchSize);
      const batchTasks = [];
      for (let i = 0; i < points.length; i += batchSize) {
        const batchIndex = Math.floor(i / batchSize) + 1;
        const batch = points.slice(i, i + batchSize);
        batchTasks.push(
          this.client
            .upsert(collectionName, { wait: true, points: batch })
            .then((result) => {
              logger.logVectorDB('Vector batch inserted', {
                knowledgeBaseId,
                collectionName,
                batchSize: batch.length,
                batchIndex,
                totalBatches,
              });
              return result;
            }),
        );
      }
      const results = await Promise.all(batchTasks);

      logger.logVectorDB('All vectors inserted', {
        knowledgeBaseId,
        collectionName,
        totalVectors: points.length,
        totalBatches: results.length,
      });

      return {
        success: true,
        insertedCount: points.length,
        results,
      };
    } catch (error) {
      logger.logError('Failed to insert vectors', error, {
        knowledgeBaseId,
        vectorCount: vectors.length,
      });
      throw new VectorDBError('Failed to insert vectors', error.message);
    }
  }

  /**
   * Search for similar vectors
   */
  async searchVectors(knowledgeBaseId, queryVector, options = {}) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const {
        limit = 10,
        threshold = 0.7,
        filters = {},
        withPayload = true,
        withVector = false,
      } = options;

      const collectionName = `kb_${knowledgeBaseId}`;

      // Build filter conditions
      let filter = null;
      if (Object.keys(filters).length > 0) {
        filter = {
          must: Object.entries(filters).map(([key, value]) => ({
            key,
            match: { value },
          })),
        };
      }

      // Perform search
      const searchResult = await this.client.search(collectionName, {
        vector: queryVector,
        limit,
        score_threshold: threshold,
        filter,
        with_payload: withPayload,
        with_vector: withVector,
      });

      // Format results
      const results = searchResult.map((point) => ({
        id: point.id,
        score: point.score,
        documentId: point.payload?.documentId,
        chunkId: point.payload?.chunkId,
        content: point.payload?.content,
        title: point.payload?.title,
        filename: point.payload?.filename,
        metadata: point.payload?.metadata || {},
        vector: withVector ? point.vector : undefined,
      }));

      logger.logVectorDB('Vector search completed', {
        knowledgeBaseId,
        collectionName,
        queryVectorSize: queryVector.length,
        resultCount: results.length,
        limit,
        threshold,
        hasFilters: Object.keys(filters).length > 0,
      });

      return results;
    } catch (error) {
      logger.logError('Failed to search vectors', error, {
        knowledgeBaseId,
        queryVectorSize: queryVector?.length,
        options,
      });
      throw new VectorDBError('Failed to search vectors', error.message);
    }
  }

  /**
   * Delete vectors by document ID
   */
  async deleteVectorsByDocument(knowledgeBaseId, documentId) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const collectionName = `kb_${knowledgeBaseId}`;

      // Delete points with matching document ID
      const result = await this.client.delete(collectionName, {
        filter: {
          must: [{
            key: 'documentId',
            match: { value: documentId },
          }],
        },
      });

      logger.logVectorDB('Vectors deleted by document', {
        knowledgeBaseId,
        collectionName,
        documentId,
        operation_id: result.operation_id,
      });

      return result;
    } catch (error) {
      logger.logError('Failed to delete vectors by document', error, {
        knowledgeBaseId,
        documentId,
      });
      throw new VectorDBError('Failed to delete vectors by document', error.message);
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(knowledgeBaseId) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const collectionName = `kb_${knowledgeBaseId}`;

      const info = await this.client.getCollection(collectionName);

      logger.logVectorDB('Collection info retrieved', {
        knowledgeBaseId,
        collectionName,
        vectorsCount: info.vectors_count,
        indexedVectorsCount: info.indexed_vectors_count,
      });

      return {
        name: collectionName,
        vectorsCount: info.vectors_count,
        indexedVectorsCount: info.indexed_vectors_count,
        pointsCount: info.points_count,
        segmentsCount: info.segments_count,
        config: info.config,
        status: info.status,
      };
    } catch (error) {
      if (error.message?.includes('Not found')) {
        return null;
      }

      logger.logError('Failed to get collection info', error, {
        knowledgeBaseId,
      });
      throw new VectorDBError('Failed to get collection info', error.message);
    }
  }

  /**
   * Update vector payload
   */
  async updateVectorPayload(knowledgeBaseId, pointId, payload) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const collectionName = `kb_${knowledgeBaseId}`;

      const result = await this.client.setPayload(collectionName, {
        payload,
        points: [pointId],
      });

      logger.logVectorDB('Vector payload updated', {
        knowledgeBaseId,
        collectionName,
        pointId,
        operation_id: result.operation_id,
      });

      return result;
    } catch (error) {
      logger.logError('Failed to update vector payload', error, {
        knowledgeBaseId,
        pointId,
      });
      throw new VectorDBError('Failed to update vector payload', error.message);
    }
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(knowledgeBaseId) {
    try {
      const info = await this.getCollectionInfo(knowledgeBaseId);

      if (!info) {
        return null;
      }

      return {
        totalVectors: info.vectorsCount,
        indexedVectors: info.indexedVectorsCount,
        totalPoints: info.pointsCount,
        segments: info.segmentsCount,
        status: info.status,
        indexingProgress: info.vectorsCount > 0 ? ((info.indexedVectorsCount / info.vectorsCount) * 100).toFixed(2) : 0,
      };
    } catch (error) {
      logger.logError('Failed to get collection stats', error, {
        knowledgeBaseId,
      });
      throw new VectorDBError('Failed to get collection stats', error.message);
    }
  }

  /**
   * Batch delete vectors by IDs
   */
  async deleteVectorsByIds(knowledgeBaseId, pointIds) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const collectionName = `kb_${knowledgeBaseId}`;

      const result = await this.client.delete(collectionName, {
        points: pointIds,
      });

      logger.logVectorDB('Vectors deleted by IDs', {
        knowledgeBaseId,
        collectionName,
        deletedCount: pointIds.length,
        operation_id: result.operation_id,
      });

      return result;
    } catch (error) {
      logger.logError('Failed to delete vectors by IDs', error, {
        knowledgeBaseId,
        pointIds,
      });
      throw new VectorDBError('Failed to delete vectors by IDs', error.message);
    }
  }

  /**
   * Scroll through all points in collection
   */
  async scrollPoints(knowledgeBaseId, options = {}) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const {
        limit = 100,
        offset = null,
        withPayload = true,
        withVector = false,
        filter = null,
      } = options;

      const collectionName = `kb_${knowledgeBaseId}`;

      const result = await this.client.scroll(collectionName, {
        limit,
        offset,
        with_payload: withPayload,
        with_vector: withVector,
        filter,
      });

      logger.logVectorDB('Points scrolled', {
        knowledgeBaseId,
        collectionName,
        pointCount: result.points.length,
        nextPageOffset: result.next_page_offset,
      });

      return {
        points: result.points,
        nextPageOffset: result.next_page_offset,
      };
    } catch (error) {
      logger.logError('Failed to scroll points', error, {
        knowledgeBaseId,
        options,
      });
      throw new VectorDBError('Failed to scroll points', error.message);
    }
  }
}

// Create singleton instance
const vectorDBService = new VectorDBService();

module.exports = vectorDBService;
