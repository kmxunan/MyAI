const axios = require('axios');
const logger = require('../utils/logger');
const { ValidationError, ProcessingError } = require('../utils/errors');

/**
 * LLM服务类
 * 负责与大语言模型API的交互
 */
class LLMService {
  constructor() {
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY;
    this.baseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    this.defaultModel = process.env.DEFAULT_LLM_MODEL || 'openai/gpt-3.5-turbo';
    this.maxRetries = parseInt(process.env.LLM_MAX_RETRIES) || 3;
    this.timeout = parseInt(process.env.LLM_TIMEOUT) || 30000;
    
    this.supportedModels = new Map();
    this.modelCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5分钟缓存
    
    this.stats = {
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      totalTokens: 0,
      totalCost: 0,
      averageResponseTime: 0
    };
    
    this.initializeService();
  }

  /**
   * 初始化服务
   */
  async initializeService() {
    try {
      await this.loadSupportedModels();
      logger.info('LLM Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize LLM Service:', error);
    }
  }

  /**
   * 加载支持的模型列表
   */
  async loadSupportedModels() {
    try {
      const cacheKey = 'supported_models';
      const cached = this.modelCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        this.supportedModels = cached.data;
        return;
      }
      
      const response = await axios.get(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      });
      
      if (response.data && response.data.data) {
        response.data.data.forEach(model => {
          this.supportedModels.set(model.id, {
            id: model.id,
            name: model.name || model.id,
            description: model.description,
            pricing: model.pricing,
            context_length: model.context_length,
            architecture: model.architecture,
            top_provider: model.top_provider
          });
        });
        
        this.modelCache.set(cacheKey, {
          data: this.supportedModels,
          timestamp: Date.now()
        });
        
        logger.info(`Loaded ${this.supportedModels.size} supported models`);
      }
    } catch (error) {
      logger.error('Failed to load supported models:', error);
      // 使用默认模型列表
      this.loadDefaultModels();
    }
  }

  /**
   * 加载默认模型列表
   */
  loadDefaultModels() {
    const defaultModels = [
      {
        id: 'openai/gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        context_length: 4096
      },
      {
        id: 'openai/gpt-4',
        name: 'GPT-4',
        context_length: 8192
      },
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        context_length: 200000
      }
    ];
    
    defaultModels.forEach(model => {
      this.supportedModels.set(model.id, model);
    });
  }

  /**
   * 生成聊天完成
   */
  async generateChatCompletion(messages, options = {}) {
    const startTime = Date.now();
    
    try {
      this.validateChatRequest(messages, options);
      
      const requestData = {
        model: options.model || this.defaultModel,
        messages: this.formatMessages(messages),
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000,
        top_p: options.topP || 1,
        frequency_penalty: options.frequencyPenalty || 0,
        presence_penalty: options.presencePenalty || 0,
        stream: options.stream || false
      };
      
      if (options.systemPrompt) {
        requestData.messages.unshift({
          role: 'system',
          content: options.systemPrompt
        });
      }
      
      const response = await this.makeRequest('/chat/completions', requestData);
      
      const result = {
        id: response.id,
        model: response.model,
        choices: response.choices,
        usage: response.usage,
        created: response.created,
        responseTime: Date.now() - startTime
      };
      
      // 更新统计信息
      this.updateStats({
        requestCount: 1,
        successCount: 1,
        totalTokens: response.usage?.total_tokens || 0,
        responseTime: result.responseTime
      });
      
      return result;
      
    } catch (error) {
      this.stats.requestCount++;
      this.stats.errorCount++;
      logger.error('Chat completion failed:', error);
      throw error;
    }
  }

  /**
   * 生成流式聊天完成
   */
  async generateStreamingChatCompletion(messages, options = {}) {
    try {
      this.validateChatRequest(messages, options);
      
      const requestData = {
        model: options.model || this.defaultModel,
        messages: this.formatMessages(messages),
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000,
        stream: true
      };
      
      if (options.systemPrompt) {
        requestData.messages.unshift({
          role: 'system',
          content: options.systemPrompt
        });
      }
      
      const response = await axios.post(`${this.baseURL}/chat/completions`, requestData, {
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: this.timeout
      });
      
      return response.data;
      
    } catch (error) {
      logger.error('Streaming chat completion failed:', error);
      throw error;
    }
  }

  /**
   * 验证聊天请求
   */
  validateChatRequest(messages, options) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new ValidationError('Messages array is required and cannot be empty');
    }
    
    messages.forEach((message, index) => {
      if (!message.role || !message.content) {
        throw new ValidationError(`Message at index ${index} must have role and content`);
      }
      
      if (!['system', 'user', 'assistant'].includes(message.role)) {
        throw new ValidationError(`Invalid role at index ${index}: ${message.role}`);
      }
    });
    
    if (options.model && !this.supportedModels.has(options.model)) {
      throw new ValidationError(`Unsupported model: ${options.model}`);
    }
    
    if (options.temperature !== undefined && (options.temperature < 0 || options.temperature > 2)) {
      throw new ValidationError('Temperature must be between 0 and 2');
    }
    
    if (options.maxTokens !== undefined && (options.maxTokens < 1 || options.maxTokens > 4096)) {
      throw new ValidationError('Max tokens must be between 1 and 4096');
    }
  }

  /**
   * 格式化消息
   */
  formatMessages(messages) {
    return messages.map(message => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
    }));
  }

  /**
   * 发送API请求
   */
  async makeRequest(endpoint, data, retryCount = 0) {
    try {
      const response = await axios.post(`${this.baseURL}${endpoint}`, data, {
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'RAG Service'
        },
        timeout: this.timeout
      });
      
      return response.data;
      
    } catch (error) {
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        logger.warn(`Request failed, retrying (${retryCount + 1}/${this.maxRetries}):`, error.message);
        await this.delay(Math.pow(2, retryCount) * 1000); // 指数退避
        return this.makeRequest(endpoint, data, retryCount + 1);
      }
      
      throw this.handleApiError(error);
    }
  }

  /**
   * 判断是否应该重试
   */
  shouldRetry(error) {
    if (!error.response) {
      return true; // 网络错误
    }
    
    const status = error.response.status;
    return status === 429 || status >= 500; // 速率限制或服务器错误
  }

  /**
   * 处理API错误
   */
  handleApiError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const message = data?.error?.message || data?.message || 'API request failed';
      
      switch (status) {
      case 400:
        return new ValidationError(`Bad request: ${message}`);
      case 401:
        return new ProcessingError('Invalid API key');
      case 403:
        return new ProcessingError('Access forbidden');
      case 429:
        return new ProcessingError('Rate limit exceeded');
      case 500:
        return new ProcessingError('Internal server error');
      default:
        return new ProcessingError(`API error (${status}): ${message}`);
      }
    } else if (error.code === 'ECONNABORTED') {
      return new ProcessingError('Request timeout');
    } else {
      return new ProcessingError(`Network error: ${error.message}`);
    }
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取支持的模型列表
   */
  getSupportedModels() {
    return Array.from(this.supportedModels.values());
  }

  /**
   * 获取模型信息
   */
  getModelInfo(modelId) {
    return this.supportedModels.get(modelId);
  }

  /**
   * 估算Token数量
   */
  estimateTokens(text) {
    // 简单的Token估算，实际应该使用tiktoken等库
    return Math.ceil(text.length / 4);
  }

  /**
   * 更新统计信息
   */
  updateStats(updates) {
    Object.keys(updates).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(this.stats, key)) {
        if (key === 'responseTime') {
          // 计算平均响应时间
          const totalTime = this.stats.averageResponseTime * (this.stats.requestCount - 1) + updates[key];
          this.stats.averageResponseTime = totalTime / this.stats.requestCount;
        } else {
          this.stats[key] += updates[key];
        }
      }
    });
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
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      totalTokens: 0,
      totalCost: 0,
      averageResponseTime: 0
    };
  }

  /**
   * 获取健康状态
   */
  getHealthStatus() {
    const successRate = this.stats.requestCount > 0 
      ? (this.stats.successCount / this.stats.requestCount * 100).toFixed(2)
      : 100;
    
    return {
      status: 'healthy',
      apiKeyConfigured: !!this.openRouterApiKey,
      supportedModelsCount: this.supportedModels.size,
      defaultModel: this.defaultModel,
      successRate: `${successRate}%`,
      stats: this.getStats()
    };
  }
}

module.exports = LLMService;