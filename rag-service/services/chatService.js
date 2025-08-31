const axios = require('axios');
const searchService = require('./searchService');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');
const { AppError } = require('../middleware/errorHandler');

class ChatService {
  constructor() {
    this.config = {
      // OpenRouter Configuration
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      openrouterBaseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',

      // OpenAI Configuration (fallback)
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',

      // Default settings
      defaultModel: process.env.CHAT_MODEL || 'openai/gpt-3.5-turbo',
      maxTokens: parseInt(process.env.CHAT_MAX_TOKENS, 10) || 2000,
      temperature: parseFloat(process.env.CHAT_TEMPERATURE) || 0.7,
      timeout: parseInt(process.env.CHAT_TIMEOUT, 10) || 30000,

      // RAG settings
      maxContextChunks: parseInt(process.env.MAX_CONTEXT_CHUNKS, 10) || 5,
      contextRelevanceThreshold: parseFloat(process.env.CONTEXT_RELEVANCE_THRESHOLD) || 0.7,

      // Session settings
      sessionTtl: parseInt(process.env.SESSION_TTL, 10) || 3600 * 24, // 24 hours
      maxSessionHistory: parseInt(process.env.MAX_SESSION_HISTORY, 10) || 50,

      // Streaming settings
      streamingEnabled: process.env.STREAMING_ENABLED !== 'false',
    };

    // 动态模型缓存
    this.modelsCache = new Map();
    this.modelsCacheExpiry = 60 * 60 * 1000; // 1小时缓存
    this.modelsCacheTimestamp = null;
  }

  /**
   * 动态获取支持的模型列表
   */
  async getSupportedModels() {
    try {
      // 检查缓存是否有效
      if (this.modelsCache.size > 0
          && this.modelsCacheTimestamp
          && Date.now() - this.modelsCacheTimestamp < this.modelsCacheExpiry) {
        return Object.fromEntries(this.modelsCache);
      }

      // 从OpenRouter API获取模型列表
      const response = await axios.get(`${this.config.openrouterBaseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.config.openrouterApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.config.timeout,
      });

      if (!response.data || !response.data.data) {
        throw new AppError('Invalid models response from OpenRouter', 500);
      }

      // 处理模型数据并缓存
      const models = {};
      response.data.data.forEach((model) => {
        if (model.id && model.context_length) {
          models[model.id] = {
            provider: 'openrouter',
            maxTokens: Math.min(model.context_length * 0.75, 4096), // 保守估计输出token限制
            contextWindow: model.context_length,
            streaming: true,
            pricing: model.pricing || null,
          };
        }
      });

      // 更新缓存
      this.modelsCache.clear();
      Object.entries(models).forEach(([key, value]) => {
        this.modelsCache.set(key, value);
      });
      this.modelsCacheTimestamp = Date.now();

      logger.info('Models cache updated', {
        modelCount: Object.keys(models).length,
        timestamp: new Date().toISOString(),
      });

      return models;
    } catch (error) {
      logger.logError('Failed to get supported models', error);

      // 如果API调用失败，返回基本的fallback模型
      const fallbackModels = {
        'openai/gpt-3.5-turbo': {
          provider: 'openrouter',
          maxTokens: 4096,
          contextWindow: 16385,
          streaming: true,
        },
        'openai/gpt-4': {
          provider: 'openrouter',
          maxTokens: 8192,
          contextWindow: 8192,
          streaming: true,
        },
      };

      return fallbackModels;
    }
  }

  /**
   * Chat with knowledge base
   */
  async chatWithKnowledgeBase(message, knowledgeBaseId, options = {}) {
    try {
      const {
        sessionId,
        model = this.config.defaultModel,
        temperature = this.config.temperature,
        maxTokens = this.config.maxTokens,
        includeHistory = true,
        searchOptions = {},
      } = options;

      // Validate parameters
      this.validateChatParams(message, knowledgeBaseId, model);

      // Get session history if sessionId provided
      let sessionHistory = [];
      if (sessionId && includeHistory) {
        sessionHistory = await this.getSessionHistory(sessionId);
      }

      // Search for relevant context
      const contextChunks = await this.getRelevantContext(
        message,
        knowledgeBaseId,
        searchOptions,
      );

      // Build conversation context
      const conversationContext = this.buildConversationContext(
        message,
        contextChunks,
        sessionHistory,
      );

      // Generate response
      const response = await this.generateResponse(
        conversationContext,
        model,
        {
          temperature,
          maxTokens,
          stream: false,
        },
      );

      // Save to session history
      if (sessionId) {
        await this.saveToSessionHistory(sessionId, {
          userMessage: message,
          assistantResponse: response.content,
          contextChunks: contextChunks.map((chunk) => ({
            id: chunk.id,
            score: chunk.score,
            content: `${chunk.content.substring(0, 200)}...`,
          })),
          timestamp: new Date().toISOString(),
        });
      }

      logger.logRAGChat('Chat completed', {
        knowledgeBaseId,
        sessionId,
        model,
        messageLength: message.length,
        responseLength: response.content.length,
        contextChunks: contextChunks.length,
        tokensUsed: response.usage?.totalTokens,
      });

      return {
        response: response.content,
        contextChunks: contextChunks.map((chunk) => ({
          id: chunk.id,
          documentId: chunk.documentId,
          filename: chunk.filename,
          score: chunk.score,
          content: chunk.content,
        })),
        usage: response.usage,
        model,
        sessionId,
      };
    } catch (error) {
      logger.logError('Chat with knowledge base failed', error, {
        knowledgeBaseId,
        messageLength: message?.length,
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Chat failed', 500, error.message);
    }
  }

  /**
   * Stream chat with knowledge base
   */
  async streamChatWithKnowledgeBase(message, knowledgeBaseId, options = {}) {
    try {
      const {
        sessionId,
        model = this.config.defaultModel,
        temperature = this.config.temperature,
        maxTokens = this.config.maxTokens,
        includeHistory = true,
        searchOptions = {},
      } = options;

      // Validate parameters
      this.validateChatParams(message, knowledgeBaseId, model);

      if (!this.config.streamingEnabled) {
        throw new AppError('Streaming is not enabled', 400);
      }

      // Get session history if sessionId provided
      let sessionHistory = [];
      if (sessionId && includeHistory) {
        sessionHistory = await this.getSessionHistory(sessionId);
      }

      // Search for relevant context
      const contextChunks = await this.getRelevantContext(
        message,
        knowledgeBaseId,
        searchOptions,
      );

      // Build conversation context
      const conversationContext = this.buildConversationContext(
        message,
        contextChunks,
        sessionHistory,
      );

      // Generate streaming response
      const stream = await this.generateStreamingResponse(
        conversationContext,
        model,
        {
          temperature,
          maxTokens,
        },
      );

      logger.logRAGChat('Streaming chat started', {
        knowledgeBaseId,
        sessionId,
        model,
        messageLength: message.length,
        contextChunks: contextChunks.length,
      });

      return {
        stream,
        contextChunks: contextChunks.map((chunk) => ({
          id: chunk.id,
          documentId: chunk.documentId,
          filename: chunk.filename,
          score: chunk.score,
          content: chunk.content,
        })),
        model,
        sessionId,
        // Save to history after streaming completes
        saveToHistory: async (fullResponse) => {
          if (sessionId) {
            await this.saveToSessionHistory(sessionId, {
              userMessage: message,
              assistantResponse: fullResponse,
              contextChunks: contextChunks.map((chunk) => ({
                id: chunk.id,
                score: chunk.score,
                content: `${chunk.content.substring(0, 200)}...`,
              })),
              timestamp: new Date().toISOString(),
            });
          }
        },
      };
    } catch (error) {
      logger.logError('Streaming chat failed', error, {
        knowledgeBaseId,
        messageLength: message?.length,
      });

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('Streaming chat failed', 500, error.message);
    }
  }

  /**
   * Get relevant context from knowledge base
   */
  async getRelevantContext(query, knowledgeBaseId, searchOptions = {}) {
    try {
      const {
        searchType = 'hybrid',
        limit = this.config.maxContextChunks,
        minScore = this.config.contextRelevanceThreshold,
      } = searchOptions;

      let results = [];

      switch (searchType) {
      case 'semantic':
        results = await searchService.semanticSearch(query, knowledgeBaseId, {
          limit,
          minScore,
          includeMetadata: true,
        });
        break;
      case 'keyword':
        results = await searchService.keywordSearch(query, knowledgeBaseId, {
          limit,
          includeMetadata: true,
        });
        break;
      case 'hybrid':
      default:
        results = await searchService.hybridSearch(query, knowledgeBaseId, {
          limit,
          minScore,
          includeMetadata: true,
        });
        break;
      }

      logger.logRAGChat('Context retrieved', {
        query: query.substring(0, 100),
        knowledgeBaseId,
        searchType,
        resultCount: results.length,
        avgScore: results.length > 0 ? results.reduce((sum, r) => sum + r.score, 0) / results.length : 0,
      });

      return results;
    } catch (error) {
      logger.logError('Failed to get relevant context', error, {
        query: query?.substring(0, 100),
        knowledgeBaseId,
      });

      // Return empty context instead of failing the entire chat
      return [];
    }
  }

  /**
   * Build conversation context for LLM
   */
  static buildConversationContext(userMessage, contextChunks, sessionHistory = []) {
    const messages = [];

    // System prompt with context
    const basePrompt = 'You are a helpful AI assistant that answers questions based on the provided context.';
    const instructionPrompt = 'Use the context information to provide accurate and relevant answers.';
    const fallbackPrompt = 'If the context doesn\'t contain enough information to answer the question, say so clearly.';
    let systemPrompt = `${basePrompt} ${instructionPrompt} ${fallbackPrompt}`;

    if (contextChunks.length > 0) {
      systemPrompt += '\n\nContext information:\n';
      contextChunks.forEach((chunk, index) => {
        const scoreText = chunk.score.toFixed(3);
        const contextHeader = `\n[Context ${index + 1}]`;
        const contextMeta = ` (Score: ${scoreText}, Source: ${chunk.filename})`;
        const contextEntry = `${contextHeader}${contextMeta}\n${chunk.content}\n`;
        systemPrompt += contextEntry;
      });
    } else {
      const noContextMessage = '\n\nNo relevant context found in the knowledge base.';
      const userNotification = ' Please let the user know that you don\'t have specific information about their query.';
      const combinedMessage = noContextMessage + userNotification;
      systemPrompt += combinedMessage;
    }

    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Add session history (keep recent messages)
    const recentHistory = sessionHistory.slice(-10); // Keep last 10 exchanges
    recentHistory.forEach((entry) => {
      messages.push(
        { role: 'user', content: entry.userMessage },
        { role: 'assistant', content: entry.assistantResponse },
      );
    });

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    return messages;
  }

  /**
   * Generate response using LLM API
   */
  async generateResponse(messages, model, options = {}) {
    try {
      const {
        temperature = this.config.temperature,
        maxTokens = this.config.maxTokens,
        stream = false,
      } = options;

      // 动态获取模型配置
      const supportedModels = await this.getSupportedModels();
      const modelConfig = supportedModels[model];
      if (!modelConfig) {
        throw new AppError(`Unsupported model: ${model}`, 400);
      }

      let apiUrl; let headers;

      if (modelConfig.provider === 'openrouter') {
        apiUrl = `${this.config.openrouterBaseUrl}/chat/completions`;
        const referer = process.env.OPENROUTER_REFERER || 'http://localhost:3000';
        headers = {
          Authorization: `Bearer ${this.config.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'MyAI RAG Service',
        };
      } else {
        apiUrl = `${this.config.openaiBaseUrl}/chat/completions`;
        headers = {
          Authorization: `Bearer ${this.config.openaiApiKey}`,
          'Content-Type': 'application/json',
        };
      }

      const requestBody = {
        model,
        messages,
        temperature,
        max_tokens: Math.min(maxTokens, modelConfig.maxTokens),
        stream,
      };

      const response = await axios.post(apiUrl, requestBody, {
        headers,
        timeout: this.config.timeout,
      });

      const hasValidResponse = response.data
        && response.data.choices
        && response.data.choices.length > 0;

      if (!hasValidResponse) {
        throw new AppError('Invalid response from LLM API', 500);
      }

      const choice = response.data.choices[0];

      return {
        content: choice.message.content,
        usage: response.data.usage,
        finishReason: choice.finish_reason,
      };
    } catch (error) {
      if (error.response) {
        const { status } = error.response;
        const message = error.response.data?.error?.message || error.response.statusText;

        if (status === 401) {
          throw new AppError('Invalid API key', 401);
        } else if (status === 429) {
          throw new AppError('Rate limit exceeded', 429);
        } else if (status === 400) {
          throw new AppError(`Bad request: ${message}`, 400);
        } else {
          throw new AppError(`LLM API error (${status}): ${message}`, 500);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new AppError('Request timeout', 408);
      } else {
        throw new AppError(`Network error: ${error.message}`, 500);
      }
    }
  }

  /**
   * Generate streaming response
   */
  async generateStreamingResponse(messages, model, options = {}) {
    try {
      const {
        temperature = this.config.temperature,
        maxTokens = this.config.maxTokens,
      } = options;

      // 动态获取模型配置
      const supportedModels = await this.getSupportedModels();
      const modelConfig = supportedModels[model];
      if (!modelConfig) {
        throw new AppError(`Unsupported model: ${model}`, 400);
      }

      if (!modelConfig.streaming) {
        throw new AppError(`Model ${model} does not support streaming`, 400);
      }

      let apiUrl; let headers;

      if (modelConfig.provider === 'openrouter') {
        apiUrl = `${this.config.openrouterBaseUrl}/chat/completions`;
        const referer = process.env.OPENROUTER_REFERER || 'http://localhost:3000';
        headers = {
          Authorization: `Bearer ${this.config.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'MyAI RAG Service',
        };
      } else {
        apiUrl = `${this.config.openaiBaseUrl}/chat/completions`;
        headers = {
          Authorization: `Bearer ${this.config.openaiApiKey}`,
          'Content-Type': 'application/json',
        };
      }

      const requestBody = {
        model,
        messages,
        temperature,
        max_tokens: Math.min(maxTokens, modelConfig.maxTokens),
        stream: true,
      };

      const response = await axios.post(apiUrl, requestBody, {
        headers,
        timeout: this.config.timeout,
        responseType: 'stream',
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        const { status } = error.response;
        const message = error.response.data?.error?.message || error.response.statusText;

        if (status === 401) {
          throw new AppError('Invalid API key', 401);
        } else if (status === 429) {
          throw new AppError('Rate limit exceeded', 429);
        } else {
          throw new AppError(`LLM API error (${status}): ${message}`, 500);
        }
      } else {
        throw new AppError(`Streaming error: ${error.message}`, 500);
      }
    }
  }

  /**
   * Get session history
   */
  static async getSessionHistory(sessionId) {
    try {
      const historyKey = `session:${sessionId}:history`;
      const history = await cache.get(historyKey);
      return history || [];
    } catch (error) {
      logger.logError('Failed to get session history', error, { sessionId });
      return [];
    }
  }

  /**
   * Save to session history
   */
  async saveToSessionHistory(sessionId, entry) {
    try {
      const historyKey = `session:${sessionId}:history`;
      const history = await this.getSessionHistory(sessionId);

      history.push(entry);

      // Keep only recent entries
      if (history.length > this.config.maxSessionHistory) {
        history.splice(0, history.length - this.config.maxSessionHistory);
      }

      await cache.set(historyKey, history, this.config.sessionTtl);

      logger.logRAGChat('Session history updated', {
        sessionId,
        historyLength: history.length,
      });
    } catch (error) {
      logger.logError('Failed to save session history', error, { sessionId });
    }
  }

  /**
   * Get session info
   */
  async getSessionInfo(sessionId) {
    try {
      const history = await this.getSessionHistory(sessionId);

      return {
        sessionId,
        messageCount: history.length,
        lastActivity: history.length > 0 ? history[history.length - 1].timestamp : null,
        createdAt: history.length > 0 ? history[0].timestamp : null,
      };
    } catch (error) {
      logger.logError('Failed to get session info', error, { sessionId });
      throw new AppError('Failed to get session info', 500, error.message);
    }
  }

  /**
   * Delete session
   */
  static async deleteSession(sessionId) {
    try {
      const historyKey = `session:${sessionId}:history`;
      await cache.del(historyKey);

      logger.logRAGChat('Session deleted', { sessionId });

      return { success: true, sessionId };
    } catch (error) {
      logger.logError('Failed to delete session', error, { sessionId });
      throw new AppError('Failed to delete session', 500, error.message);
    }
  }

  /**
   * Validate chat parameters
   */
  static validateChatParams(message, knowledgeBaseId) {
    const isValidMessage = message
      && typeof message === 'string'
      && message.trim().length > 0;

    if (!isValidMessage) {
      throw new AppError('Message is required and must be a non-empty string', 400);
    }

    if (!knowledgeBaseId || typeof knowledgeBaseId !== 'string') {
      throw new AppError('Knowledge base ID is required', 400);
    }

    // Model validation will be done in getSupportedModels method
  }

  /**
   * Get service health status
   */
  async getHealthStatus() {
    try {
      // Test API connectivity
      const testMessages = [{
        role: 'user',
        content: 'Hello',
      }];

      await this.generateResponse(testMessages, this.config.defaultModel, {
        maxTokens: 10,
      });

      return {
        status: 'healthy',
        config: {
          defaultModel: this.config.defaultModel,
          streamingEnabled: this.config.streamingEnabled,
          maxContextChunks: this.config.maxContextChunks,
          supportedModels: Object.keys(await this.getSupportedModels()),
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
   * Get chat statistics
   */
  async getChatStats() {
    try {
      const sessionKeys = await cache.keys('session:*:history');

      return {
        activeSessions: sessionKeys.length,
        maxSessionHistory: this.config.maxSessionHistory,
        sessionTtl: this.config.sessionTtl,
        supportedModels: Object.keys(await this.getSupportedModels()).length,
      };
    } catch (error) {
      logger.logError('Failed to get chat stats', error);
      return {
        activeSessions: 0,
        error: error.message,
      };
    }
  }
}

// Create singleton instance
const chatService = new ChatService();

module.exports = chatService;
