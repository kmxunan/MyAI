const axios = require('axios');
const { encode } = require('gpt-3-encoder');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { EmbeddingError } = require('../middleware/errorHandler');
const { cache } = require('../config/redis');

class EmbeddingService {
  constructor() {
    this.config = {
      // OpenAI Configuration
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',

      // OpenRouter Configuration (alternative)
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',

      // Default settings
      defaultModel: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
      maxTokens: parseInt(process.env.EMBEDDING_MAX_TOKENS, 10) || 8191,
      batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE, 10) || 100,
      timeout: parseInt(process.env.EMBEDDING_TIMEOUT, 10) || 30000,

      // Cache settings
      cacheEnabled: process.env.EMBEDDING_CACHE_ENABLED !== 'false',
      cacheTtl: parseInt(process.env.EMBEDDING_CACHE_TTL, 10) || 3600 * 24 * 7, // 7 days
    };

    this.supportedModels = {
      'text-embedding-ada-002': {
        provider: 'openai',
        dimensions: 1536,
        maxTokens: 8191,
        costPer1kTokens: 0.0001,
      },
      'text-embedding-3-small': {
        provider: 'openai',
        dimensions: 1536,
        maxTokens: 8191,
        costPer1kTokens: 0.00002,
      },
      'text-embedding-3-large': {
        provider: 'openai',
        dimensions: 3072,
        maxTokens: 8191,
        costPer1kTokens: 0.00013,
      },
    };
  }

  /**
   * Get embedding for a single text
   */
  async getEmbedding(text, model = null) {
    try {
      const embedModel = model || this.config.defaultModel;

      if (!this.supportedModels[embedModel]) {
        throw new EmbeddingError(`Unsupported embedding model: ${embedModel}`);
      }

      // Check cache first
      if (this.config.cacheEnabled) {
        const cacheKey = EmbeddingService.getCacheKey(text, embedModel);
        const cachedEmbedding = await cache.get(cacheKey);

        if (cachedEmbedding) {
          logger.logEmbedding('Embedding retrieved from cache', {
            model: embedModel,
            textLength: text.length,
            cacheKey,
          });
          return cachedEmbedding;
        }
      }

      // Validate text length
      const tokenCount = EmbeddingService.countTokens(text);
      if (tokenCount > this.supportedModels[embedModel].maxTokens) {
        throw new EmbeddingError(
          `Text too long: ${tokenCount} tokens exceeds limit of ${this.supportedModels[embedModel].maxTokens}`,
        );
      }

      // Generate embedding
      const embedding = await this.callEmbeddingAPI([text], embedModel);

      if (!embedding || embedding.length === 0) {
        throw new EmbeddingError('No embedding returned from API');
      }

      const result = embedding[0];

      // Cache the result
      if (this.config.cacheEnabled) {
        const cacheKey = EmbeddingService.getCacheKey(text, embedModel);
        await cache.set(cacheKey, result, this.config.cacheTtl);
      }

      logger.logEmbedding('Embedding generated', {
        model: embedModel,
        textLength: text.length,
        tokenCount,
        embeddingDimensions: result.length,
      });

      return result;
    } catch (error) {
      logger.logError('Failed to generate embedding', error, {
        model: model || this.config.defaultModel,
        textLength: text?.length,
      });

      if (error instanceof EmbeddingError) {
        throw error;
      }

      throw new EmbeddingError('Failed to generate embedding', error.message);
    }
  }

  /**
   * Get embeddings for multiple texts in batches
   */
  async getBatchEmbeddings(texts, model = null) {
    try {
      const embedModel = model || this.config.defaultModel;

      if (!Array.isArray(texts) || texts.length === 0) {
        throw new EmbeddingError('Texts must be a non-empty array');
      }

      if (!this.supportedModels[embedModel]) {
        throw new EmbeddingError(`Unsupported embedding model: ${embedModel}`);
      }

      const results = [];
      const uncachedTexts = [];
      const uncachedIndices = [];

      // Check cache for each text
      if (this.config.cacheEnabled) {
        const cachePromises = texts.map(async (text, i) => {
          const cacheKey = this.getCacheKey(text, embedModel);
          const cachedEmbedding = await cache.get(cacheKey);
          return { text, index: i, cachedEmbedding };
        });

        const cacheResults = await Promise.all(cachePromises);
        cacheResults.forEach(({ text, index, cachedEmbedding }) => {
          if (cachedEmbedding) {
            results[index] = cachedEmbedding;
          } else {
            uncachedTexts.push(text);
            uncachedIndices.push(index);
          }
        });
      } else {
        uncachedTexts.push(...texts);
        uncachedIndices.push(...texts.map((_, i) => i));
      }

      // Process uncached texts in batches
      if (uncachedTexts.length > 0) {
        const { batchSize } = this.config;
        const batches = [];

        for (let i = 0; i < uncachedTexts.length; i += batchSize) {
          batches.push({
            batch: uncachedTexts.slice(i, i + batchSize),
            batchIndices: uncachedIndices.slice(i, i + batchSize),
            batchIndex: Math.floor(i / batchSize) + 1,
          });
        }

        const batchPromises = batches.map(async ({ batch, batchIndices, batchIndex }) => {
          // Validate token counts
          batch.forEach((text) => {
            const tokenCount = EmbeddingService.countTokens(text);
            if (tokenCount > this.supportedModels[embedModel].maxTokens) {
              throw new EmbeddingError(
                `Text too long: ${tokenCount} tokens exceeds limit of ${this.supportedModels[embedModel].maxTokens}`,
              );
            }
          });

          // Generate embeddings for batch
          const batchEmbeddings = await this.callEmbeddingAPI(batch, embedModel);

          if (batchEmbeddings.length !== batch.length) {
            throw new EmbeddingError(
              `Embedding count mismatch: expected ${batch.length}, got ${batchEmbeddings.length}`,
            );
          }

          // Store results and cache
          const cachePromises = batchEmbeddings.map(async (embedding, j) => {
            const originalIndex = batchIndices[j];
            results[originalIndex] = embedding;

            // Cache the result
            if (this.config.cacheEnabled) {
              const cacheKey = this.getCacheKey(batch[j], embedModel);
              await cache.set(cacheKey, embedding, this.config.cacheTtl);
            }
          });

          await Promise.all(cachePromises);

          logger.logEmbedding('Batch embeddings generated', {
            model: embedModel,
            batchSize: batch.length,
            batchIndex,
            totalBatches: batches.length,
          });
        });

        await Promise.all(batchPromises);
      }

      logger.logEmbedding('All embeddings completed', {
        model: embedModel,
        totalTexts: texts.length,
        cachedCount: texts.length - uncachedTexts.length,
        generatedCount: uncachedTexts.length,
      });

      return results;
    } catch (error) {
      logger.logError('Failed to generate batch embeddings', error, {
        model: model || this.config.defaultModel,
        textCount: texts?.length,
      });

      if (error instanceof EmbeddingError) {
        throw error;
      }

      throw new EmbeddingError('Failed to generate batch embeddings', error.message);
    }
  }

  /**
   * Call the embedding API
   */
  async callEmbeddingAPI(texts, model) {
    try {
      const modelConfig = this.supportedModels[model];
      let apiUrl; let headers; let
        requestBody;

      if (modelConfig.provider === 'openai') {
        // Use OpenAI API or OpenRouter
        const useOpenRouter = !this.config.openaiApiKey && this.config.openrouterApiKey;

        if (useOpenRouter) {
          apiUrl = `${this.config.openrouterBaseUrl}/embeddings`;
          headers = {
            Authorization: `Bearer ${this.config.openrouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3000',
            'X-Title': 'MyAI RAG Service',
          };
        } else {
          apiUrl = `${this.config.openaiBaseUrl}/embeddings`;
          headers = {
            Authorization: `Bearer ${this.config.openaiApiKey}`,
            'Content-Type': 'application/json',
          };
        }

        requestBody = {
          model,
          input: texts,
          encoding_format: 'float',
        };
      } else {
        throw new EmbeddingError(`Unsupported provider: ${modelConfig.provider}`);
      }

      const response = await axios.post(apiUrl, requestBody, {
        headers,
        timeout: this.config.timeout,
      });

      if (!response.data || !response.data.data) {
        throw new EmbeddingError('Invalid response format from embedding API');
      }

      const embeddings = response.data.data.map((item) => item.embedding);

      // Log usage if available
      if (response.data.usage) {
        logger.logEmbedding('API usage', {
          model,
          promptTokens: response.data.usage.prompt_tokens,
          totalTokens: response.data.usage.total_tokens,
          textCount: texts.length,
        });
      }

      return embeddings;
    } catch (error) {
      if (error.response) {
        const { status } = error.response;
        const message = error.response.data?.error?.message || error.response.statusText;

        if (status === 401) {
          throw new EmbeddingError('Invalid API key');
        } else if (status === 429) {
          throw new EmbeddingError('Rate limit exceeded');
        } else if (status === 400) {
          throw new EmbeddingError(`Bad request: ${message}`);
        } else {
          throw new EmbeddingError(`API error (${status}): ${message}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new EmbeddingError('Request timeout');
      } else {
        throw new EmbeddingError(`Network error: ${error.message}`);
      }
    }
  }

  /**
   * Count tokens in text (approximate)
   */
  static countTokens(text) {
    try {
      return encode(text).length;
    } catch (error) {
      // Fallback to character-based estimation
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Generate cache key for text and model
   */
  static getCacheKey(text, model) {
    const hash = crypto.createHash('sha256')
      .update(`${model}:${text}`)
      .digest('hex');
    return `embedding:${hash}`;
  }

  /**
   * Get supported models
   */
  getSupportedModels() {
    return Object.keys(this.supportedModels).map((model) => ({
      name: model,
      ...this.supportedModels[model],
    }));
  }

  /**
   * Get model info
   */
  getModelInfo(model) {
    return this.supportedModels[model] || null;
  }

  /**
   * Calculate embedding cost
   */
  calculateCost(tokenCount, model) {
    const modelConfig = this.supportedModels[model];
    if (!modelConfig) {
      return 0;
    }

    return (tokenCount / 1000) * modelConfig.costPer1kTokens;
  }

  /**
   * Validate embedding configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.config.openaiApiKey && !this.config.openrouterApiKey) {
      errors.push('No API key configured (OPENAI_API_KEY or OPENROUTER_API_KEY required)');
    }

    if (!this.supportedModels[this.config.defaultModel]) {
      errors.push(`Invalid default model: ${this.config.defaultModel}`);
    }

    if (this.config.batchSize <= 0 || this.config.batchSize > 2048) {
      errors.push('Batch size must be between 1 and 2048');
    }

    if (this.config.timeout <= 0) {
      errors.push('Timeout must be positive');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get service health status
   */
  async getHealthStatus() {
    try {
      const configValidation = this.validateConfig();

      if (!configValidation.valid) {
        return {
          status: 'unhealthy',
          errors: configValidation.errors,
        };
      }

      // Test with a simple embedding
      const testText = 'Health check test';
      await this.getEmbedding(testText);

      return {
        status: 'healthy',
        config: {
          defaultModel: this.config.defaultModel,
          batchSize: this.config.batchSize,
          cacheEnabled: this.config.cacheEnabled,
          supportedModels: Object.keys(this.supportedModels),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  /**
   * Clear embedding cache
   */
  static async clearCache(pattern = 'embedding:*') {
    try {
      const keys = await cache.keys(pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => cache.del(key)));
        logger.logEmbedding('Cache cleared', { pattern, deletedKeys: keys.length });
      }
      return { success: true, deletedKeys: keys.length };
    } catch (error) {
      logger.logError('Failed to clear embedding cache', error, { pattern });
      throw new EmbeddingError('Failed to clear cache', error.message);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      const keys = await cache.keys('embedding:*');

      return {
        totalCachedEmbeddings: keys.length,
        cacheEnabled: this.config.cacheEnabled,
        cacheTtl: this.config.cacheTtl,
      };
    } catch (error) {
      logger.logError('Failed to get cache stats', error);
      return {
        totalCachedEmbeddings: 0,
        cacheEnabled: this.config.cacheEnabled,
        cacheTtl: this.config.cacheTtl,
        error: error.message,
      };
    }
  }
}

// Create singleton instance
const embeddingService = new EmbeddingService();

module.exports = embeddingService;
