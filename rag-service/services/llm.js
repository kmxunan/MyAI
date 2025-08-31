const axios = require('axios');
const logger = require('../utils/logger');
const { LLMError } = require('../middleware/errorHandler');
const { cache } = require('../config/redis');

class LLMService {
  constructor() {
    this.config = {
      // OpenAI Configuration
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',

      // OpenRouter Configuration (alternative)
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',

      // Default settings
      defaultModel: process.env.LLM_MODEL || 'gpt-3.5-turbo',
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS, 10) || 4096,
      temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
      timeout: parseInt(process.env.LLM_TIMEOUT, 10) || 60000,

      // Cache settings
      cacheEnabled: process.env.LLM_CACHE_ENABLED !== 'false',
      cacheTtl: parseInt(process.env.LLM_CACHE_TTL, 10) || 3600, // 1 hour
    };

    this.supportedModels = {
      // OpenAI Models
      'gpt-4': {
        provider: 'openai',
        maxTokens: 8192,
        contextWindow: 8192,
        costPer1kTokens: { input: 0.03, output: 0.06 },
      },
      'gpt-4-turbo': {
        provider: 'openai',
        maxTokens: 4096,
        contextWindow: 128000,
        costPer1kTokens: { input: 0.01, output: 0.03 },
      },
      'gpt-3.5-turbo': {
        provider: 'openai',
        maxTokens: 4096,
        contextWindow: 16385,
        costPer1kTokens: { input: 0.0015, output: 0.002 },
      },
      // OpenRouter Models
      'anthropic/claude-3-sonnet': {
        provider: 'openrouter',
        maxTokens: 4096,
        contextWindow: 200000,
        costPer1kTokens: { input: 0.003, output: 0.015 },
      },
      'meta-llama/llama-2-70b-chat': {
        provider: 'openrouter',
        maxTokens: 4096,
        contextWindow: 4096,
        costPer1kTokens: { input: 0.0007, output: 0.0009 },
      },
    };
  }

  /**
   * Generate chat completion
   */
  async generateCompletion(messages, options = {}) {
    try {
      this.validateConfig();
      const model = options.model || this.config.defaultModel;
      const modelInfo = this.getModelInfo(model);

      if (!modelInfo) {
        throw new LLMError(`Unsupported model: ${model}`);
      }

      // Check cache if enabled
      if (this.config.cacheEnabled && !options.stream) {
        const cacheKey = this.getCacheKey(messages, options);
        const cachedResponse = await this.getFromCache(cacheKey);
        if (cachedResponse) {
          logger.debug('LLM response retrieved from cache', { model, cacheKey });
          return cachedResponse;
        }
      }

      const requestOptions = {
        model,
        messages,
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature ?? this.config.temperature,
        stream: options.stream || false,
        ...options.additionalParams,
      };

      const response = await this.callLLMAPI(requestOptions, modelInfo.provider);

      // Cache response if not streaming
      if (this.config.cacheEnabled && !options.stream) {
        const cacheKey = this.getCacheKey(messages, options);
        await this.saveToCache(cacheKey, response);
      }

      return response;
    } catch (error) {
      logger.error('Failed to generate LLM completion', {
        error: error.message,
        model: options.model || this.config.defaultModel,
        messagesCount: messages?.length,
      });
      throw new LLMError(`LLM completion failed: ${error.message}`);
    }
  }

  /**
   * Generate streaming completion
   */
  async generateStreamingCompletion(messages, options = {}) {
    try {
      this.validateConfig();
      const model = options.model || this.config.defaultModel;
      const modelInfo = this.getModelInfo(model);

      if (!modelInfo) {
        throw new LLMError(`Unsupported model: ${model}`);
      }

      const requestOptions = {
        model,
        messages,
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature ?? this.config.temperature,
        stream: true,
        ...options.additionalParams,
      };

      return await this.callStreamingLLMAPI(requestOptions, modelInfo.provider);
    } catch (error) {
      logger.error('Failed to generate streaming LLM completion', {
        error: error.message,
        model: options.model || this.config.defaultModel,
        messagesCount: messages?.length,
      });
      throw new LLMError(`Streaming LLM completion failed: ${error.message}`);
    }
  }

  /**
   * Call LLM API (non-streaming)
   */
  async callLLMAPI(requestOptions, provider) {
    const config = this.getProviderConfig(provider);

    try {
      const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        requestOptions,
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            ...(provider === 'openrouter' && {
              'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3000',
              'X-Title': process.env.OPENROUTER_TITLE || 'RAG Service',
            }),
          },
          timeout: this.config.timeout,
        },
      );

      return {
        content: response.data.choices[0]?.message?.content || '',
        usage: response.data.usage,
        model: response.data.model,
        finishReason: response.data.choices[0]?.finish_reason,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error.response) {
        const errorData = error.response.data;
        throw new LLMError(
          `${provider} API error: ${errorData.error?.message || error.message}`,
          error.response.status,
        );
      }
      throw new LLMError(`${provider} API request failed: ${error.message}`);
    }
  }

  /**
   * Call LLM API (streaming)
   */
  async callStreamingLLMAPI(requestOptions, provider) {
    const config = this.getProviderConfig(provider);

    try {
      const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        requestOptions,
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            ...(provider === 'openrouter' && {
              'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3000',
              'X-Title': process.env.OPENROUTER_TITLE || 'RAG Service',
            }),
          },
          timeout: this.config.timeout,
          responseType: 'stream',
        },
      );

      return response.data;
    } catch (error) {
      if (error.response) {
        const errorData = error.response.data;
        throw new LLMError(
          `${provider} streaming API error: ${errorData.error?.message || error.message}`,
          error.response.status,
        );
      }
      throw new LLMError(`${provider} streaming API request failed: ${error.message}`);
    }
  }

  /**
   * Get provider configuration
   */
  getProviderConfig(provider) {
    switch (provider) {
    case 'openai':
      if (!this.config.openaiApiKey) {
        throw new LLMError('OpenAI API key not configured');
      }
      return {
        apiKey: this.config.openaiApiKey,
        baseUrl: this.config.openaiBaseUrl,
      };
    case 'openrouter':
      if (!this.config.openrouterApiKey) {
        throw new LLMError('OpenRouter API key not configured');
      }
      return {
        apiKey: this.config.openrouterApiKey,
        baseUrl: this.config.openrouterBaseUrl,
      };
    default:
      throw new LLMError(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get cache key for request
   */
  getCacheKey(messages, options) {
    const key = {
      messages,
      model: options.model || this.config.defaultModel,
      maxTokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
      additionalParams: options.additionalParams || {},
    };
    return `llm:${Buffer.from(JSON.stringify(key)).toString('base64')}`;
  }

  /**
   * Get response from cache
   */
  async getFromCache(cacheKey) {
    try {
      // record last cache access to use `this` and for observability
      this.lastCacheAccess = Date.now();
      if (!cache) return null;
      const cached = await cache.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Failed to get LLM response from cache', {
        error: error.message,
        cacheKey,
      });
      return null;
    }
  }

  /**
   * Save response to cache
   */
  async saveToCache(cacheKey, response) {
    try {
      if (!cache) return;
      await cache.setex(cacheKey, this.config.cacheTtl, JSON.stringify(response));
    } catch (error) {
      logger.warn('Failed to save LLM response to cache', {
        error: error.message,
        cacheKey,
      });
    }
  }

  /**
   * Get supported models
   */
  getSupportedModels() {
    return Object.keys(this.supportedModels);
  }

  /**
   * Get model information
   */
  getModelInfo(model) {
    return this.supportedModels[model] || null;
  }

  /**
   * Calculate estimated cost
   */
  calculateCost(inputTokens, outputTokens, model) {
    const modelInfo = this.getModelInfo(model);
    if (!modelInfo || !modelInfo.costPer1kTokens) {
      return null;
    }

    const inputCost = (inputTokens / 1000) * modelInfo.costPer1kTokens.input;
    const outputCost = (outputTokens / 1000) * modelInfo.costPer1kTokens.output;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      currency: 'USD',
    };
  }

  /**
   * Validate configuration
   */
  validateConfig() {
    const errors = [];

    if (!this.config.openaiApiKey && !this.config.openrouterApiKey) {
      errors.push('At least one API key (OpenAI or OpenRouter) must be configured');
    }

    if (this.config.maxTokens <= 0) {
      errors.push('Max tokens must be greater than 0');
    }

    if (this.config.temperature < 0 || this.config.temperature > 2) {
      errors.push('Temperature must be between 0 and 2');
    }

    if (errors.length > 0) {
      throw new LLMError(`LLM configuration validation failed: ${errors.join(', ')}`);
    }

    return true;
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    try {
      this.validateConfig();

      const status = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        config: {
          defaultModel: this.config.defaultModel,
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
          cacheEnabled: this.config.cacheEnabled,
          hasOpenAIKey: !!this.config.openaiApiKey,
          hasOpenRouterKey: !!this.config.openrouterApiKey,
        },
        supportedModels: this.getSupportedModels(),
      };

      // Test API connectivity
      try {
        const testMessages = [{ role: 'user', content: 'Hello' }];
        await this.generateCompletion(testMessages, {
          maxTokens: 10,
          temperature: 0,
        });
        status.apiConnectivity = 'working';
      } catch (error) {
        status.apiConnectivity = 'failed';
        status.apiError = error.message;
        status.status = 'degraded';
      }

      return status;
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  /**
   * Clear cache
   */
  async clearCache(pattern = 'llm:*') {
    try {
      // record last cache clear time and count to use `this` and for observability
      this.lastCacheClear = Date.now();
      this.cacheClearsCount = (this.cacheClearsCount || 0) + 1;
      if (!cache) {
        logger.warn('Cache not available for clearing');
        return { cleared: 0 };
      }

      const keys = await cache.keys(pattern);
      if (keys.length === 0) {
        return { cleared: 0 };
      }

      await cache.del(...keys);
      logger.info('LLM cache cleared', { pattern, cleared: keys.length });

      return { cleared: keys.length };
    } catch (error) {
      logger.error('Failed to clear LLM cache', {
        error: error.message,
        pattern,
      });
      throw new LLMError(`Failed to clear cache: ${error.message}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    try {
      if (!cache) {
        return { available: false };
      }

      const keys = await cache.keys('llm:*');
      return {
        available: true,
        totalKeys: keys.length,
        pattern: 'llm:*',
        ttl: this.config.cacheTtl,
      };
    } catch (error) {
      logger.error('Failed to get LLM cache stats', {
        error: error.message,
      });
      return { available: false, error: error.message };
    }
  }
}

// Create singleton instance
const llmService = new LLMService();

module.exports = llmService;
