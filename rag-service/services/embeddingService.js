const axios = require('axios');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class EmbeddingService {
  constructor() {
    this.config = {
      // OpenRouter Configuration
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      
      // Default embedding model
      defaultModel: process.env.EMBEDDING_MODEL || 'openai/text-embedding-ada-002',
      
      // Request settings
      timeout: parseInt(process.env.EMBEDDING_TIMEOUT, 10) || 30000,
      maxRetries: parseInt(process.env.EMBEDDING_MAX_RETRIES, 10) || 3,
      retryDelay: parseInt(process.env.EMBEDDING_RETRY_DELAY, 10) || 1000,
      
      // Batch processing
      maxBatchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE, 10) || 100,
      maxInputLength: parseInt(process.env.EMBEDDING_MAX_INPUT_LENGTH, 10) || 8000,
    };

    // 支持的嵌入模型配置
    this.supportedModels = {
      'openai/text-embedding-ada-002': {
        dimensions: 1536,
        maxTokens: 8191,
        pricing: {
          input: 0.0001, // per 1K tokens
        },
      },
      'openai/text-embedding-3-small': {
        dimensions: 1536,
        maxTokens: 8191,
        pricing: {
          input: 0.00002, // per 1K tokens
        },
      },
      'openai/text-embedding-3-large': {
        dimensions: 3072,
        maxTokens: 8191,
        pricing: {
          input: 0.00013, // per 1K tokens
        },
      },
    };

    // 配置将在初始化时验证
  }

  /**
   * 验证配置
   * @throws {AppError} 配置无效时抛出错误
   */
  validateConfig() {
    // 在开发环境中，如果没有配置API密钥，只发出警告而不抛出错误
    if (!this.config.openrouterApiKey || this.config.openrouterApiKey === 'your_openrouter_api_key_here') {
      const message = 'OpenRouter API key is not configured. Some features may not work properly.';
      if (process.env.NODE_ENV === 'development') {
        logger.logger.warn(`Warning: ${message}`);
        return; // 在开发环境中跳过验证
      } else {
        throw new AppError('OpenRouter API key is required', 500);
      }
    }

    if (!this.supportedModels[this.config.defaultModel]) {
      throw new AppError(`Default model ${this.config.defaultModel} is not supported`, 500);
    }

    if (this.config.maxBatchSize <= 0) {
      throw new AppError('Max batch size must be greater than 0', 500);
    }

    if (this.config.maxInputLength <= 0) {
      throw new AppError('Max input length must be greater than 0', 500);
    }
  }

  /**
   * 生成文本嵌入向量
   * @param {string|string[]} input - 输入文本或文本数组
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} 嵌入结果
   */
  async generateEmbeddings(input, options = {}) {
    try {
      const {
        model = this.config.defaultModel,
        user = null,
        dimensions = null,
      } = options;

      // 验证模型
      if (!this.supportedModels[model]) {
        throw new AppError(`Unsupported embedding model: ${model}`, 400);
      }

      // 预处理输入
      const processedInput = this.preprocessInput(input);
      
      // 验证输入长度
      this.validateInput(processedInput, model);

      // 构建请求数据
      const requestData = {
        model,
        input: processedInput,
      };

      // 添加可选参数
      if (user) requestData.user = user;
      if (dimensions && model.includes('text-embedding-3')) {
        requestData.dimensions = dimensions;
      }

      // 发送请求
      const response = await this.makeEmbeddingRequest(requestData);
      
      // 处理响应
      return this.processEmbeddingResponse(response, model, processedInput);
    } catch (error) {
      logger.error('Failed to generate embeddings', {
        error: error.message,
        model: options.model,
        inputType: Array.isArray(input) ? 'array' : 'string',
        inputLength: Array.isArray(input) ? input.length : input?.length,
      });
      throw error;
    }
  }

  /**
   * 批量生成嵌入向量
   * @param {string[]} texts - 文本数组
   * @param {Object} options - 配置选项
   * @returns {Promise<Object[]>} 嵌入结果数组
   */
  async generateBatchEmbeddings(texts, options = {}) {
    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new AppError('Input must be a non-empty array of texts', 400);
      }

      const { batchSize = this.config.maxBatchSize } = options;
      const results = [];
      
      // 分批处理
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchResult = await this.generateEmbeddings(batch, options);
        
        // 展开批次结果
        if (batchResult.embeddings && Array.isArray(batchResult.embeddings)) {
          results.push(...batchResult.embeddings.map((embedding, index) => ({
            text: batch[index],
            embedding: embedding.embedding,
            index: i + index,
            tokens: embedding.tokens || 0,
          })));
        }
        
        // 添加延迟以避免速率限制
        if (i + batchSize < texts.length) {
          await this.delay(100);
        }
      }

      return {
        embeddings: results,
        totalTokens: results.reduce((sum, item) => sum + (item.tokens || 0), 0),
        model: options.model || this.config.defaultModel,
        totalTexts: texts.length,
      };
    } catch (error) {
      logger.error('Failed to generate batch embeddings', {
        error: error.message,
        textsCount: texts.length,
        batchSize: options.batchSize,
      });
      throw error;
    }
  }

  /**
   * 计算两个向量的余弦相似度
   * @param {number[]} vectorA - 向量A
   * @param {number[]} vectorB - 向量B
   * @returns {number} 相似度分数 (0-1)
   */
  static calculateCosineSimilarity(vectorA, vectorB) {
    if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
      throw new AppError('Vectors must be arrays', 400);
    }
    
    if (vectorA.length !== vectorB.length) {
      throw new AppError('Vectors must have the same dimensions', 400);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * 预处理输入文本
   * @param {string|string[]} input - 输入文本
   * @returns {string|string[]} 处理后的文本
   */
  preprocessInput(input) {
    if (Array.isArray(input)) {
      return input.map(text => this.cleanText(text));
    }
    return this.cleanText(input);
  }

  /**
   * 清理文本
   * @param {string} text - 输入文本
   * @returns {string} 清理后的文本
   */
  cleanText(text) {
    if (typeof text !== 'string') {
      throw new AppError('Input must be a string', 400);
    }

    return text
      .replace(/\s+/g, ' ') // 合并多个空格
      .replace(/\n+/g, ' ') // 替换换行符
      .trim(); // 去除首尾空格
  }

  /**
   * 验证输入
   * @param {string|string[]} input - 输入文本
   * @param {string} model - 模型名称
   */
  validateInput(input, _model) {
    if (Array.isArray(input)) {
      if (input.length > this.config.maxBatchSize) {
        throw new AppError(`Batch size cannot exceed ${this.config.maxBatchSize}`, 400);
      }
      
      input.forEach((text, index) => {
        if (text.length > this.config.maxInputLength) {
          throw new AppError(`Text at index ${index} exceeds maximum length of ${this.config.maxInputLength} characters`, 400);
        }
      });
    } else {
      if (input.length > this.config.maxInputLength) {
        throw new AppError(`Text exceeds maximum length of ${this.config.maxInputLength} characters`, 400);
      }
    }
  }

  /**
   * 发送嵌入请求
   * @param {Object} requestData - 请求数据
   * @returns {Promise<Object>} API响应
   */
  async makeEmbeddingRequest(requestData) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${this.config.openrouterBaseUrl}/embeddings`,
          requestData,
          {
            headers: {
              'Authorization': `Bearer ${this.config.openrouterApiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3000',
              'X-Title': process.env.OPENROUTER_X_TITLE || 'RAG Service',
            },
            timeout: this.config.timeout,
          }
        );

        return response.data;
      } catch (error) {
        lastError = error;
        
        // 检查是否应该重试
        if (attempt < this.config.maxRetries && this.shouldRetry(error)) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1); // 指数退避
          logger.warn(`Embedding request failed, retrying in ${delay}ms`, {
            attempt,
            error: error.message,
            status: error.response?.status,
          });
          await this.delay(delay);
          continue;
        }
        
        break;
      }
    }

    // 处理最终错误
    if (lastError.response) {
      const { status, data } = lastError.response;
      throw new AppError(
        `OpenRouter API error: ${data?.error?.message || 'Unknown error'}`,
        status
      );
    }
    
    throw new AppError('Failed to connect to OpenRouter API', 500);
  }

  /**
   * 处理嵌入响应
   * @param {Object} response - API响应
   * @param {string} model - 模型名称
   * @param {string|string[]} originalInput - 原始输入
   * @returns {Object} 处理后的结果
   */
  processEmbeddingResponse(response, model, _originalInput) {
    if (!response.data || !Array.isArray(response.data)) {
      throw new AppError('Invalid embedding response format', 500);
    }

    const embeddings = response.data.map((item, index) => ({
      embedding: item.embedding,
      index: item.index || index,
      tokens: response.usage?.total_tokens || 0,
    }));

    const result = {
      embeddings,
      model,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      dimensions: embeddings[0]?.embedding?.length || this.supportedModels[model]?.dimensions,
    };

    // 计算成本
    if (response.usage?.total_tokens) {
      const modelConfig = this.supportedModels[model];
      if (modelConfig?.pricing?.input) {
        result.cost = (response.usage.total_tokens / 1000) * modelConfig.pricing.input;
      }
    }

    return result;
  }

  /**
   * 判断是否应该重试
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  shouldRetry(error) {
    if (!error.response) {
      return true; // 网络错误，重试
    }

    const status = error.response.status;
    
    // 重试的状态码
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(status);
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取模型信息
   * @param {string} model - 模型名称
   * @returns {Object} 模型配置
   */
  getModelInfo(model = this.config.defaultModel) {
    return this.supportedModels[model] || null;
  }

  /**
   * 获取支持的模型列表
   * @returns {Object} 支持的模型配置
   */
  getSupportedModels() {
    return { ...this.supportedModels };
  }

  /**
   * 估算文本的token数量（粗略估算）
   * @param {string} text - 输入文本
   * @returns {number} 估算的token数量
   */
  static estimateTokens(text) {
    if (typeof text !== 'string') {
      return 0;
    }
    
    // 粗略估算：英文约4个字符=1个token，中文约1.5个字符=1个token
    const englishChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length;
    const otherChars = text.length - englishChars;
    
    return Math.ceil(englishChars / 4 + otherChars / 1.5);
  }

  /**
   * 获取健康状态
   * @returns {Promise<Object>} 健康状态
   */
  async getHealthStatus() {
    try {
      // 测试简单的嵌入请求
      const testResult = await this.generateEmbeddings('test', {
        model: this.config.defaultModel,
      });
      
      return {
        status: 'healthy',
        model: this.config.defaultModel,
        dimensions: testResult.dimensions,
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
}

// 创建单例实例
const embeddingService = new EmbeddingService();

module.exports = embeddingService;