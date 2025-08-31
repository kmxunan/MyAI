const axios = require('axios');
const { QdrantClient } = require('@qdrant/js-client-rest');
const logger = require('../utils/logger');

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY,
});

// Collection name for storing document embeddings
const COLLECTION_NAME = 'documents';

/**
 * Initialize Qdrant collection if it doesn't exist
 */
const initializeCollection = async () => {
  try {
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (collection) => collection.name === COLLECTION_NAME,
    );

    if (!collectionExists) {
      await qdrantClient.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 1536, // OpenAI embedding dimension
          distance: 'Cosine',
        },
      });
      logger.info('Qdrant collection created successfully', {
        collection: COLLECTION_NAME,
      });
    }
  } catch (error) {
    logger.error('Failed to initialize Qdrant collection', {
      error: error.message,
      collection: COLLECTION_NAME,
    });
    throw error;
  }
};

/**
 * Generate embeddings using OpenAI API
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<number[]>} - Embedding vector
 */
const generateEmbedding = async (text) => {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/embeddings',
      {
        input: text,
        model: 'text-embedding-ada-002',
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    return response.data.data[0].embedding;
  } catch (error) {
    logger.error('Failed to generate embedding', {
      error: error.message,
      textLength: text.length,
    });
    throw error;
  }
};

/**
 * Generate and store embeddings for document chunks
 * @param {string[]} chunks - Array of text chunks
 * @param {string} documentId - Document ID
 * @param {string} knowledgeBaseId - Knowledge base ID
 * @returns {Promise<void>}
 */
const generateEmbeddings = async (chunks, documentId, knowledgeBaseId) => {
  try {
    await initializeCollection();

    const points = [];
    const embeddingPromises = chunks.map(async (chunk, i) => {
      const embedding = await generateEmbedding(chunk);

      return {
        id: `${documentId}_chunk_${i}`,
        vector: embedding,
        payload: {
          documentId,
          knowledgeBaseId,
          chunkIndex: i,
          text: chunk,
          createdAt: new Date().toISOString(),
        },
      };
    });

    const embeddedPoints = await Promise.all(embeddingPromises);
    points.push(...embeddedPoints);

    await qdrantClient.upsert(COLLECTION_NAME, {
      wait: true,
      points,
    });

    logger.info('Embeddings generated and stored successfully', {
      documentId,
      knowledgeBaseId,
      chunksCount: chunks.length,
    });
  } catch (error) {
    logger.error('Failed to generate embeddings', {
      error: error.message,
      documentId,
      knowledgeBaseId,
      chunksCount: chunks.length,
    });
    throw error;
  }
};

/**
 * Delete all vectors for a specific document
 * @param {string} documentId - Document ID
 * @param {string} knowledgeBaseId - Knowledge base ID
 * @returns {Promise<void>}
 */
const deleteDocumentVectors = async (documentId, knowledgeBaseId) => {
  try {
    await qdrantClient.delete(COLLECTION_NAME, {
      wait: true,
      filter: {
        must: [
          {
            key: 'documentId',
            match: {
              value: documentId,
            },
          },
          {
            key: 'knowledgeBaseId',
            match: {
              value: knowledgeBaseId,
            },
          },
        ],
      },
    });

    logger.info('Document vectors deleted successfully', {
      documentId,
      knowledgeBaseId,
    });
  } catch (error) {
    logger.error('Failed to delete document vectors', {
      error: error.message,
      documentId,
      knowledgeBaseId,
    });
    throw error;
  }
};

/**
 * Search for similar vectors
 * @param {string} query - Search query
 * @param {string} knowledgeBaseId - Knowledge base ID
 * @param {number} limit - Number of results to return
 * @returns {Promise<Object[]>} - Search results
 */
const searchVectors = async (query, knowledgeBaseId, limit = 10) => {
  try {
    await initializeCollection();

    const queryEmbedding = await generateEmbedding(query);

    const searchResult = await qdrantClient.search(COLLECTION_NAME, {
      vector: queryEmbedding,
      limit,
      filter: {
        must: [
          {
            key: 'knowledgeBaseId',
            match: {
              value: knowledgeBaseId,
            },
          },
        ],
      },
      with_payload: true,
    });

    return searchResult.map((result) => ({
      id: result.id,
      score: result.score,
      documentId: result.payload.documentId,
      chunkIndex: result.payload.chunkIndex,
      text: result.payload.text,
      createdAt: result.payload.createdAt,
    }));
  } catch (error) {
    logger.error('Failed to search vectors', {
      error: error.message,
      query,
      knowledgeBaseId,
      limit,
    });
    throw error;
  }
};

module.exports = {
  initializeCollection,
  generateEmbedding,
  generateEmbeddings,
  deleteDocumentVectors,
  searchVectors,
};
