const { openRouterService } = require('./openRouterService');
const logger = require('../utils/logger');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

/**
 * 聊天服务类
 * 处理对话逻辑，集成OpenRouter API
 */
class ChatService {
  constructor() {
    this.maxHistoryLength = parseInt(process.env.CHAT_MAX_HISTORY_LENGTH) || 20;
    this.defaultModel = process.env.CHAT_DEFAULT_MODEL || 'openai/gpt-3.5-turbo';
    this.systemPrompts = {
      default: '你是一个有用的AI助手，请用中文回答用户的问题。',
      business: '你是MyAI平台的业务助手，专门帮助用户处理客户管理、项目管理、合同管理和财务管理相关的问题。',
      technical: '你是MyAI平台的技术助手，专门帮助用户解决技术问题和系统使用问题。',
      rag: '你是一个基于知识库的AI助手，请根据提供的上下文信息回答用户问题。如果上下文中没有相关信息，请明确说明。'
    };
  }

  /**
   * 创建新的聊天会话
   */
  async createChatSession(userId, options = {}) {
    try {
      // 验证用户存在并获取用户设置
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 从用户设置中获取默认模型，如果没有设置则使用系统默认值
      const userDefaultModel = user.settings?.ai?.defaultModel || this.defaultModel;
      const userTemperature = user.settings?.ai?.temperature || 0.7;
      const userMaxTokens = user.settings?.ai?.maxTokens || 2048;

      const {
        title = '新对话',
        model = userDefaultModel,
        systemPrompt = this.systemPrompts.default,
        temperature = userTemperature,
        maxTokens = userMaxTokens,
        metadata = {}
      } = options;

      const session = new Conversation({
        conversationId: uuidv4(),
        user: userId,
        title,
        model: {
          provider: model.split('/')[0] || 'openai',
          name: model.split('/')[1] || model,
          parameters: {
            temperature,
            maxTokens
          }
        },
        systemPrompt,
        metadata: new Map(Object.entries(metadata)),
        status: 'active'
      });

      await session.save();

      logger.info('Chat session created', {
        conversationId: session.conversationId,
        userId,
        model,
        title
      });

      return session;
    } catch (error) {
      logger.error('Failed to create chat session', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 获取用户的聊天会话列表
   */
  async getUserChatSessions(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status = 'active',
        sortBy = 'updatedAt',
        sortOrder = 'desc'
      } = options;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const query = { user: userId };
      if (status) {
        query.status = status;
      }

      const sessions = await Conversation.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean();

      const total = await Conversation.countDocuments(query);

      return {
        sessions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get user chat sessions', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 获取单个聊天会话
   */
  async getChatSession(sessionId, userId) {
    try {
      const session = await Conversation.findOne({
        conversationId: sessionId,
        user: userId
      }).lean();

      if (!session) {
        throw new Error('Chat session not found');
      }

      return session;
    } catch (error) {
      logger.error('Failed to get chat session', {
        sessionId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 发送消息
   */
  async sendMessage(sessionId, userId, content, _options = {}) {
    try {
      // 获取会话
      const session = await this.getChatSession(sessionId, userId);
      
      // 创建用户消息
      const userMessage = new Message({
        conversation: session._id,
        sender: userId,
        content,
        role: 'user',
        messageType: 'text'
      });
      
      await userMessage.save();
      
      // 获取AI回复
      const aiResponse = await this.getChatCompletion(session, content);
      
      // 创建AI消息
      const aiMessage = new Message({
        conversation: session._id,
        content: aiResponse.content,
        role: 'assistant',
        messageType: 'text',
        metadata: {
          model: session.model.name,
          tokens: aiResponse.usage
        }
      });
      
      await aiMessage.save();
      
      return {
        userMessage,
        aiMessage
      };
    } catch (error) {
      logger.error('Failed to send message', {
        sessionId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 获取会话历史消息
   */
  async getSessionHistory(sessionId, limit = null) {
    try {
      const query = Message.find({ conversation: sessionId })
        .sort({ createdAt: 1 })
        .select('role content createdAt');
      
      if (limit) {
        query.limit(limit);
      }
      
      const messages = await query.exec();
      
      return messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    } catch (error) {
      logger.error('Failed to get session history', {
        sessionId,
        error: error.message
      });
      return [];
    }
  }

  /**
   * 获取AI回复
   */
  async getChatCompletion(session, userMessage) {
    try {
      const modelName = `${session.model.provider}/${session.model.name}`;
      
      // 获取历史消息
      const historyMessages = await this.getSessionHistory(session._id, this.maxHistoryLength);
      
      const messages = [
        {
          role: 'system',
          content: session.systemPrompt
        },
        ...historyMessages,
        {
          role: 'user',
          content: userMessage
        }
      ];

      const response = await openRouterService.chatCompletion({
        model: modelName,
        messages,
        temperature: session.model.parameters.temperature,
        maxTokens: session.model.parameters.maxTokens
      });

      return {
        content: response.choices[0].message.content,
        usage: response.usage
      };
    } catch (error) {
      logger.error('Failed to get chat completion', {
        sessionId: session.conversationId,
        error: error.message
      });
      throw error;
    }
  }
}

const chatService = new ChatService();

module.exports = {
  ChatService,
  chatService
};