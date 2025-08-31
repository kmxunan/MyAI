const axios = require('axios');
const logger = require('../utils/logger');

/**
 * OpenRouter API 服务类
 * 统一管理多个AI模型的接入
 */
class OpenRouterService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    this.timeout = parseInt(process.env.OPENROUTER_TIMEOUT) || 60000;
    this.maxRetries = parseInt(process.env.OPENROUTER_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.OPENROUTER_RETRY_DELAY) || 1000;
    
    // 默认模型配置
    this.defaultModels = {
      chat: process.env.OPENROUTER_DEFAULT_CHAT_MODEL || 'openai/gpt-3.5-turbo',
      embedding: process.env.OPENROUTER_DEFAULT_EMBEDDING_MODEL || 'openai/text-embedding-ada-002',
      completion: process.env.OPENROUTER_DEFAULT_COMPLETION_MODEL || 'openai/gpt-3.5-turbo-instruct'
    };
    
    // 模型价格缓存（动态获取）
    this.modelPricingCache = new Map();
    this.pricingCacheExpiry = 60 * 60 * 1000; // 1小时缓存
    
    // 模型能力映射
    this.modelCapabilities = {
      'openai/gpt-4': { maxTokens: 8192, supportsVision: false, supportsFunction: true },
      'openai/gpt-4-turbo': { maxTokens: 128000, supportsVision: true, supportsFunction: true },
      'openai/gpt-3.5-turbo': { maxTokens: 4096, supportsVision: false, supportsFunction: true },
      'anthropic/claude-3-opus': { maxTokens: 200000, supportsVision: true, supportsFunction: false },
      'anthropic/claude-3-sonnet': { maxTokens: 200000, supportsVision: true, supportsFunction: false },
      'google/gemini-pro': { maxTokens: 32768, supportsVision: false, supportsFunction: true },
      'google/gemini-pro-vision': { maxTokens: 32768, supportsVision: true, supportsFunction: true }
    };
    
    this.validateConfig();
  }

  /**
   * 验证配置
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required');
    }
    
    logger.info('OpenRouter service initialized', {
      baseURL: this.baseURL,
      timeout: this.timeout,
      defaultModels: this.defaultModels
    });
  }

  /**
   * 创建HTTP客户端
   */
  createClient() {
    return axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'MyAI Platform'
      }
    });
  }

  /**
   * 重试机制
   */
  async withRetry(operation, retries = this.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        
        // 检查是否应该重试
        if (this.shouldRetry(error)) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // 指数退避
          logger.warn(`OpenRouter API call failed, retrying in ${delay}ms`, {
            attempt,
            error: error.message,
            status: error.response?.status
          });
          await this.delay(delay);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * 判断是否应该重试
   */
  shouldRetry(error) {
    if (!error.response) {
      return true; // 网络错误，重试
    }
    
    const status = error.response.status;
    return status >= 500 || status === 429; // 服务器错误或速率限制
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 聊天完成
   */
  async chatCompletion(options = {}) {
    const {
      model = this.defaultModels.chat,
      messages,
      temperature = 0.7,
      maxTokens = 2048,
      topP = 1,
      frequencyPenalty = 0,
      presencePenalty = 0,
      stream = false,
      functions = null,
      functionCall = null,
      user = null
    } = options;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array is required and cannot be empty');
    }

    const client = this.createClient();
    
    return await this.withRetry(async () => {
      const requestData = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
        stream
      };

      // 添加可选参数
      if (functions) requestData.functions = functions;
      if (functionCall) requestData.function_call = functionCall;
      if (user) requestData.user = user;

      logger.debug('OpenRouter chat completion request', {
        model,
        messageCount: messages.length,
        temperature,
        maxTokens,
        stream
      });

      const response = await client.post('/chat/completions', requestData);
      
      logger.info('OpenRouter chat completion successful', {
        model,
        usage: response.data.usage,
        finishReason: response.data.choices?.[0]?.finish_reason
      });

      return response.data;
    });
  }

  /**
   * 流式聊天完成
   */
  async streamChatCompletion(options = {}) {
    const streamOptions = { ...options, stream: true };
    
    const client = this.createClient();
    
    return await this.withRetry(async () => {
      const requestData = {
        model: streamOptions.model || this.defaultModels.chat,
        messages: streamOptions.messages,
        temperature: streamOptions.temperature || 0.7,
        max_tokens: streamOptions.maxTokens || 2048,
        top_p: streamOptions.topP || 1,
        frequency_penalty: streamOptions.frequencyPenalty || 0,
        presence_penalty: streamOptions.presencePenalty || 0,
        stream: true
      };

      logger.debug('OpenRouter streaming chat completion request', {
        model: requestData.model,
        messageCount: requestData.messages.length
      });

      const response = await client.post('/chat/completions', requestData, {
        responseType: 'stream'
      });

      return response.data;
    });
  }

  /**
   * 文本嵌入
   */
  async createEmbedding(options = {}) {
    const {
      model = this.defaultModels.embedding,
      input,
      user = null
    } = options;

    if (!input) {
      throw new Error('Input text is required for embedding');
    }

    const client = this.createClient();
    
    return await this.withRetry(async () => {
      const requestData = {
        model,
        input
      };

      if (user) requestData.user = user;

      logger.debug('OpenRouter embedding request', {
        model,
        inputType: Array.isArray(input) ? 'array' : 'string',
        inputLength: Array.isArray(input) ? input.length : input.length
      });

      const response = await client.post('/embeddings', requestData);
      
      logger.info('OpenRouter embedding successful', {
        model,
        usage: response.data.usage,
        embeddingCount: response.data.data.length
      });

      return response.data;
    });
  }

  /**
   * 文本完成（非聊天模式）
   */
  async textCompletion(options = {}) {
    const {
      model = this.defaultModels.completion,
      prompt,
      temperature = 0.7,
      maxTokens = 2048,
      topP = 1,
      frequencyPenalty = 0,
      presencePenalty = 0,
      stop = null,
      user = null
    } = options;

    if (!prompt) {
      throw new Error('Prompt is required for text completion');
    }

    const client = this.createClient();
    
    return await this.withRetry(async () => {
      const requestData = {
        model,
        prompt,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty
      };

      if (stop) requestData.stop = stop;
      if (user) requestData.user = user;

      logger.debug('OpenRouter text completion request', {
        model,
        promptLength: prompt.length,
        temperature,
        maxTokens
      });

      const response = await client.post('/completions', requestData);
      
      logger.info('OpenRouter text completion successful', {
        model,
        usage: response.data.usage,
        finishReason: response.data.choices?.[0]?.finish_reason
      });

      return response.data;
    });
  }

  /**
   * 获取可用模型列表
   */
  async getModels() {
    const client = this.createClient();
    
    return await this.withRetry(async () => {
      logger.debug('Fetching OpenRouter models');
      
      const response = await client.get('/models');
      
      logger.info('OpenRouter models fetched successfully', {
        modelCount: response.data.data.length
      });

      return response.data;
    });
  }

  /**
   * 获取分类后的模型列表
   */
  async getCategorizedModels() {
    const modelsData = await this.getModels();
    const models = modelsData.data;
    
    const categorized = {
      chat: [],
      code: [],
      image: [],
      embedding: [],
      reasoning: [],
      creative: [],
      other: []
    };
    
    models.forEach(model => {
      const category = this.categorizeModel(model);
      const modelInfo = {
        id: model.id,
        name: model.name || model.id,
        description: model.description,
        context_length: model.context_length,
        pricing: model.pricing,
        top_provider: model.top_provider,
        per_request_limits: model.per_request_limits,
        capabilities: this.getModelCapabilities(model.id),
        localPricing: this.modelPricingCache.get(model.id)
      };
      
      categorized[category].push(modelInfo);
    });
    
    // 按价格排序每个分类
    Object.keys(categorized).forEach(category => {
      categorized[category].sort((a, b) => {
        const priceA = a.localPricing?.input || a.pricing?.prompt || 0;
        const priceB = b.localPricing?.input || b.pricing?.prompt || 0;
        return priceA - priceB;
      });
    });
    
    return categorized;
  }

  /**
   * 模型分类逻辑
   */
  categorizeModel(model) {
    const modelId = model.id.toLowerCase();
    const modelName = (model.name || '').toLowerCase();
    const description = (model.description || '').toLowerCase();
    
    // 代码模型
    if (modelId.includes('code') || modelId.includes('codestral') || 
        modelName.includes('code') || description.includes('code')) {
      return 'code';
    }
    
    // 图像模型
    if (modelId.includes('vision') || modelId.includes('dall-e') || 
        modelId.includes('midjourney') || modelId.includes('stable-diffusion') ||
        description.includes('image') || description.includes('vision')) {
      return 'image';
    }
    
    // 嵌入模型
    if (modelId.includes('embedding') || modelId.includes('embed') ||
        description.includes('embedding') || description.includes('vector')) {
      return 'embedding';
    }
    
    // 推理模型
    if (modelId.includes('o1') || modelId.includes('reasoning') ||
        description.includes('reasoning') || description.includes('thinking')) {
      return 'reasoning';
    }
    
    // 创意模型
    if (modelId.includes('creative') || modelId.includes('storytelling') ||
        description.includes('creative') || description.includes('story')) {
      return 'creative';
    }
    
    // 聊天模型（默认）
    if (modelId.includes('chat') || modelId.includes('gpt') || 
        modelId.includes('claude') || modelId.includes('gemini') ||
        description.includes('chat') || description.includes('conversation')) {
      return 'chat';
    }
    
    return 'other';
  }

  /**
   * 获取模型信息
   */
  async getModelInfo(modelId) {
    if (!modelId) {
      throw new Error('Model ID is required');
    }

    const client = this.createClient();
    
    return await this.withRetry(async () => {
      logger.debug('Fetching OpenRouter model info', { modelId });
      
      const response = await client.get(`/models/${modelId}`);
      
      logger.info('OpenRouter model info fetched successfully', {
        modelId,
        modelName: response.data.id
      });

      return response.data;
    });
  }

  /**
   * 获取模型价格信息
   */
  async getModelPricing(modelId) {
    if (!modelId || typeof modelId !== 'string' || modelId.trim() === '') {
      logger.warn('Invalid model ID provided for pricing', { modelId });
      return null;
    }

    const cacheKey = `pricing_${modelId}`;
    const cached = this.modelPricingCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.pricingCacheExpiry) {
      return cached.pricing;
    }
    
    try {
      const modelInfo = await this.getModelInfo(modelId);
      const pricing = modelInfo.pricing;
      
      this.modelPricingCache.set(cacheKey, {
        pricing,
        timestamp: Date.now()
      });
      
      return pricing;
    } catch (error) {
      logger.warn('Failed to get pricing for model', { modelId, error: error.message });
      return null;
    }
  }

  /**
   * 计算成本
   */
  async calculateCost(model, inputTokens, outputTokens = 0) {
    if (!model) {
      logger.warn('Model parameter is required for cost calculation');
      return 0;
    }

    const pricing = await this.getModelPricing(model);
    if (!pricing) {
      logger.warn('No pricing information available for model', { model });
      return 0;
    }

    const inputCost = (inputTokens / 1000) * (pricing.prompt || 0);
    const outputCost = (outputTokens / 1000) * (pricing.completion || 0);
    
    return inputCost + outputCost;
  }

  /**
   * 获取模型能力
   */
  getModelCapabilities(model) {
    return this.modelCapabilities[model] || {
      maxTokens: 4096,
      supportsVision: false,
      supportsFunction: false
    };
  }

  /**
   * 推荐模型
   */
  async recommendModel(requirements = {}) {
    try {
      const {
        budget = null,
        needsVision = false,
        needsFunctionCalling = false,
        maxTokens = null,
        preferredProviders = []
      } = requirements;

      const models = await this.getModels();
      if (!models || !models.data) {
        throw new Error('Failed to get models');
      }

      let candidates = [];
      
      for (const model of models.data) {
        // 基本过滤
        if (needsVision && !this.modelCapabilities[model.id]?.supportsVision) {
          continue;
        }
        if (needsFunctionCalling && !this.modelCapabilities[model.id]?.supportsFunction) {
          continue;
        }
        if (maxTokens && this.modelCapabilities[model.id]?.maxTokens < maxTokens) {
          continue;
        }

        // 预算过滤
        if (budget) {
          const pricing = await this.getModelPricing(model.id);
          if (pricing && pricing.prompt > budget) {
            continue;
          }
        }

        candidates.push(model);
      }

      // 提供商偏好
      if (preferredProviders.length > 0) {
        const preferred = candidates.filter(model => 
          preferredProviders.some(provider => model.id.startsWith(provider))
        );
        if (preferred.length > 0) {
          candidates = preferred;
        }
      }

      // 按评分排序
      const scoredCandidates = await Promise.all(
        candidates.map(async (model) => ({
          ...model,
          score: await this.calculateModelScore(model, requirements)
        }))
      );
      
      scoredCandidates.sort((a, b) => b.score - a.score);

      return {
        success: true,
        data: {
          recommended: scoredCandidates.slice(0, 3),
          alternatives: scoredCandidates.slice(3, 8),
          total: scoredCandidates.length
        }
      };
    } catch (error) {
      logger.error('Recommend model error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 计算模型评分
   */
  async calculateModelScore(model, requirements) {
    let score = 0;
    
    const capabilities = this.getModelCapabilities(model.id);
    const pricing = await this.getModelPricing(model.id);
    
    // 基础能力评分
    score += capabilities.maxTokens / 1000;
    if (capabilities.supportsVision) score += 10;
    if (capabilities.supportsFunction) score += 5;
    
    // 价格评分（预算敏感）
    if (pricing) {
      const avgPrice = (pricing.prompt + pricing.completion) / 2;
      if (requirements.budget) {
        score += Math.max(0, (requirements.budget - avgPrice) * 1000);
      }
    }
    
    return score;
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const models = await this.getModels();
      return {
        status: 'healthy',
        modelsAvailable: models.data.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('OpenRouter health check failed', {
        error: error.message,
        status: error.response?.status
      });
      
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 创建聊天完成
   */
  async createChatCompletion(options = {}) {
    try {
      const {
        model,
        messages,
        temperature = 0.7,
        max_tokens = 2048,
        stream = false,
        ...otherOptions
      } = options;

      if (!model) {
        throw new Error('Model is required');
      }

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and cannot be empty');
      }

      const requestBody = {
        model,
        messages,
        temperature,
        max_tokens,
        stream,
        ...otherOptions
      };

      logger.info('Creating chat completion', {
        model,
        messageCount: messages.length,
        temperature,
        max_tokens
      });

      const response = await this.httpClient.post('/api/v1/chat/completions', requestBody);
      
      if (!response.data) {
        throw new Error('Invalid response from OpenRouter API');
      }

      logger.info('Chat completion created successfully', {
        model,
        usage: response.data.usage
      });

      return response.data;
    } catch (error) {
      logger.error('Create chat completion error:', {
        model: options.model,
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      throw error;
    }
  }

  /**
   * 获取使用统计
   */
  async getUsageStats() {
    // OpenRouter 可能提供使用统计API，这里是占位符
    try {
      // 实际实现需要根据OpenRouter的API文档
      // 这里应该是实际的API调用，现在返回模拟数据
      const response = await Promise.resolve({
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        period: 'current_month'
      });
      return response;
    } catch (error) {
      logger.error('Failed to get OpenRouter usage stats', {
        error: error.message
      });
      return null;
    }
  }
}

// 创建单例实例
const openRouterService = new OpenRouterService();

module.exports = {
  OpenRouterService,
  openRouterService
};