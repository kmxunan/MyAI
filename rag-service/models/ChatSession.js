const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const chatSessionSchema = new mongoose.Schema({
  // 基本信息
  sessionId: {
    type: String,
    unique: true,
    default: () => `session_${uuidv4().replace(/-/g, '')}`,
  },

  title: {
    type: String,
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
    default: 'New Chat',
  },

  // 关联信息
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true,
  },

  knowledgeBaseId: {
    type: String,
    required: [true, 'Knowledge base ID is required'],
    index: true,
  },

  // 聊天配置
  config: {
    // LLM 配置
    model: {
      type: String,
      default: 'gpt-3.5-turbo',
    },

    temperature: {
      type: Number,
      min: [0, 'Temperature cannot be negative'],
      max: [2, 'Temperature cannot exceed 2'],
      default: 0.7,
    },

    maxTokens: {
      type: Number,
      min: [1, 'Max tokens must be at least 1'],
      max: [32000, 'Max tokens cannot exceed 32000'],
      default: 2000,
    },

    topP: {
      type: Number,
      min: [0, 'Top P cannot be negative'],
      max: [1, 'Top P cannot exceed 1'],
      default: 1,
    },

    frequencyPenalty: {
      type: Number,
      min: [-2, 'Frequency penalty cannot be less than -2'],
      max: [2, 'Frequency penalty cannot exceed 2'],
      default: 0,
    },

    presencePenalty: {
      type: Number,
      min: [-2, 'Presence penalty cannot be less than -2'],
      max: [2, 'Presence penalty cannot exceed 2'],
      default: 0,
    },

    // RAG 配置
    rag: {
      enabled: {
        type: Boolean,
        default: true,
      },

      searchType: {
        type: String,
        enum: ['semantic', 'keyword', 'hybrid'],
        default: 'hybrid',
      },

      topK: {
        type: Number,
        min: [1, 'Top K must be at least 1'],
        max: [50, 'Top K cannot exceed 50'],
        default: 5,
      },

      scoreThreshold: {
        type: Number,
        min: [0, 'Score threshold cannot be negative'],
        max: [1, 'Score threshold cannot exceed 1'],
        default: 0.7,
      },

      includeMetadata: {
        type: Boolean,
        default: true,
      },

      contextWindow: {
        type: Number,
        min: [1, 'Context window must be at least 1'],
        max: [10, 'Context window cannot exceed 10'],
        default: 3,
      },
    },

    // 系统提示词
    systemPrompt: {
      type: String,
      maxlength: [2000, 'System prompt cannot exceed 2000 characters'],
      default: 'You are a helpful AI assistant. Use the provided context to answer questions accurately and helpfully.',
    },

    // 流式响应
    streaming: {
      type: Boolean,
      default: false,
    },
  },

  // 消息历史
  messages: [{
    messageId: {
      type: String,
      default: () => `msg_${uuidv4().replace(/-/g, '')}`,
    },

    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: [true, 'Message role is required'],
    },

    content: {
      type: String,
      required: [true, 'Message content is required'],
      maxlength: [50000, 'Message content cannot exceed 50000 characters'],
    },

    // RAG 上下文信息
    context: {
      searchQuery: String,
      searchResults: [{
        documentId: String,
        chunkId: String,
        content: String,
        score: Number,
        metadata: {
          filename: String,
          chunkIndex: Number,
          documentTitle: String,
        },
      }],

      searchType: {
        type: String,
        enum: ['semantic', 'keyword', 'hybrid'],
      },

      searchTime: Number, // 搜索耗时（毫秒）
    },

    // 生成信息
    generation: {
      model: String,
      tokensUsed: {
        prompt: { type: Number, default: 0 },
        completion: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
      },

      cost: {
        type: Number,
        min: [0, 'Cost cannot be negative'],
        default: 0,
      },

      responseTime: Number, // 响应时间（毫秒）

      finishReason: {
        type: String,
        enum: ['stop', 'length', 'content_filter', 'function_call'],
      },
    },

    // 消息元数据
    metadata: {
      userAgent: String,
      ipAddress: String,
      timestamp: {
        type: Date,
        default: Date.now,
      },

      edited: {
        type: Boolean,
        default: false,
      },

      editHistory: [{
        content: String,
        editedAt: {
          type: Date,
          default: Date.now,
        },
      }],

      // 用户反馈
      feedback: {
        rating: {
          type: Number,
          min: [1, 'Rating must be at least 1'],
          max: [5, 'Rating cannot exceed 5'],
        },

        helpful: Boolean,

        comment: {
          type: String,
          maxlength: [1000, 'Feedback comment cannot exceed 1000 characters'],
        },

        submittedAt: Date,
      },
    },
  }],

  // 会话统计
  stats: {
    messageCount: {
      type: Number,
      default: 0,
      min: [0, 'Message count cannot be negative'],
    },

    totalTokensUsed: {
      type: Number,
      default: 0,
      min: [0, 'Total tokens used cannot be negative'],
    },

    totalCost: {
      type: Number,
      default: 0,
      min: [0, 'Total cost cannot be negative'],
    },

    avgResponseTime: {
      type: Number,
      min: [0, 'Average response time cannot be negative'],
    },

    searchCount: {
      type: Number,
      default: 0,
      min: [0, 'Search count cannot be negative'],
    },

    lastMessageAt: {
      type: Date,
    },

    sessionDuration: {
      type: Number, // 会话持续时间（毫秒）
      min: [0, 'Session duration cannot be negative'],
    },
  },

  // 会话状态
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'archived'],
    default: 'active',
    index: true,
  },

  // 访问控制
  access: {
    isPublic: {
      type: Boolean,
      default: false,
    },

    sharedWith: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      permission: {
        type: String,
        enum: ['read', 'write'],
        default: 'read',
      },
      sharedAt: {
        type: Date,
        default: Date.now,
      },
    }],

    shareToken: {
      type: String,
      unique: true,
      sparse: true,
    },

    shareExpiresAt: {
      type: Date,
    },
  },

  // 标签和分类
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters'],
  }],

  category: {
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters'],
  },

  // 自定义元数据
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map(),
  },

  // 软删除
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },

  deletedAt: {
    type: Date,
  },

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  // 归档
  isArchived: {
    type: Boolean,
    default: false,
    index: true,
  },

  archivedAt: {
    type: Date,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// 虚拟字段
chatSessionSchema.virtual('duration').get(function () {
  if (this.stats.lastMessageAt) {
    return this.stats.lastMessageAt - this.createdAt;
  }
  return Date.now() - this.createdAt;
});

chatSessionSchema.virtual('isActive').get(function () {
  return this.status === 'active' && !this.isDeleted && !this.isArchived;
});

chatSessionSchema.virtual('lastMessage').get(function () {
  return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
});

chatSessionSchema.virtual('userMessageCount').get(function () {
  return this.messages.filter((msg) => msg.role === 'user').length;
});

chatSessionSchema.virtual('assistantMessageCount').get(function () {
  return this.messages.filter((msg) => msg.role === 'assistant').length;
});

chatSessionSchema.virtual('avgTokensPerMessage').get(function () {
  if (this.stats.messageCount === 0) return 0;
  return Math.round(this.stats.totalTokensUsed / this.stats.messageCount);
});

// 索引
chatSessionSchema.index({ sessionId: 1 }, { unique: true });
chatSessionSchema.index({ userId: 1, createdAt: -1 });
chatSessionSchema.index({ knowledgeBaseId: 1, createdAt: -1 });
chatSessionSchema.index({ status: 1 });
chatSessionSchema.index({ isDeleted: 1, isArchived: 1 });
chatSessionSchema.index({ 'access.shareToken': 1 }, { sparse: true });
chatSessionSchema.index({ tags: 1 });
chatSessionSchema.index({ category: 1 });
chatSessionSchema.index({ 'stats.lastMessageAt': -1 });

// 复合索引
chatSessionSchema.index({ userId: 1, status: 1, isDeleted: 1 });
chatSessionSchema.index({ knowledgeBaseId: 1, status: 1, isDeleted: 1 });
chatSessionSchema.index({ userId: 1, 'stats.lastMessageAt': -1 });

// 中间件
chatSessionSchema.pre('save', function (next) {
  // 更新消息统计
  this.stats.messageCount = this.messages.length;

  // 计算总token使用量和成本
  let totalTokens = 0;
  let totalCost = 0;
  let totalResponseTime = 0;
  let responseCount = 0;

  this.messages.forEach((message) => {
    if (message.generation) {
      totalTokens += message.generation.tokensUsed.total || 0;
      totalCost += message.generation.cost || 0;

      if (message.generation.responseTime) {
        totalResponseTime += message.generation.responseTime;
        responseCount += 1;
      }
    }
  });

  this.stats.totalTokensUsed = totalTokens;
  this.stats.totalCost = totalCost;

  if (responseCount > 0) {
    this.stats.avgResponseTime = Math.round(totalResponseTime / responseCount);
  }

  // 更新最后消息时间
  if (this.messages.length > 0) {
    const lastMessage = this.messages[this.messages.length - 1];
    this.stats.lastMessageAt = lastMessage.metadata.timestamp;
  }

  // 计算会话持续时间
  if (this.stats.lastMessageAt) {
    this.stats.sessionDuration = this.stats.lastMessageAt - this.createdAt;
  }

  // 自动生成标题（如果是默认标题且有用户消息）
  if (this.title === 'New Chat' && this.messages.length > 0) {
    const firstUserMessage = this.messages.find((msg) => msg.role === 'user');
    if (firstUserMessage) {
      // 取前50个字符作为标题
      this.title = firstUserMessage.content.substring(0, 50).trim();
      if (firstUserMessage.content.length > 50) {
        this.title += '...';
      }
    }
  }

  next();
});

// 软删除中间件
chatSessionSchema.pre(/^find/, function (next) {
  // 默认不返回已删除的会话
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// 实例方法
chatSessionSchema.methods.addMessage = function (role, content, context = null, generation = null, metadata = {}) {
  const message = {
    messageId: `msg_${uuidv4().replace(/-/g, '')}`,
    role,
    content,
    context,
    generation,
    metadata: {
      ...metadata,
      timestamp: new Date(),
    },
  };

  this.messages.push(message);

  // 更新搜索计数
  if (context && context.searchResults) {
    this.stats.searchCount += 1;
  }

  return this.save();
};

chatSessionSchema.methods.updateLastMessage = function (updates) {
  if (this.messages.length === 0) {
    throw new Error('No messages to update');
  }

  const lastMessage = this.messages[this.messages.length - 1];
  Object.assign(lastMessage, updates);

  return this.save();
};

chatSessionSchema.methods.editMessage = function (messageId, newContent) {
  const message = this.messages.find((msg) => msg.messageId === messageId);

  if (!message) {
    throw new Error('Message not found');
  }

  // 保存编辑历史
  if (!message.metadata.editHistory) {
    message.metadata.editHistory = [];
  }

  message.metadata.editHistory.push({
    content: message.content,
    editedAt: new Date(),
  });

  message.content = newContent;
  message.metadata.edited = true;

  return this.save();
};

chatSessionSchema.methods.deleteMessage = function (messageId) {
  this.messages = this.messages.filter((msg) => msg.messageId !== messageId);
  return this.save();
};

chatSessionSchema.methods.addFeedback = function (messageId, feedback) {
  const message = this.messages.find((msg) => msg.messageId === messageId);

  if (!message) {
    throw new Error('Message not found');
  }

  message.metadata.feedback = {
    ...feedback,
    submittedAt: new Date(),
  };

  return this.save();
};

chatSessionSchema.methods.updateConfig = function (newConfig) {
  this.config = {
    ...this.config,
    ...newConfig,
  };

  return this.save();
};

chatSessionSchema.methods.archive = function () {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.status = 'archived';
  return this.save();
};

chatSessionSchema.methods.unarchive = function () {
  this.isArchived = false;
  this.archivedAt = undefined;
  this.status = 'active';
  return this.save();
};

chatSessionSchema.methods.softDelete = function (deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.status = 'completed';
  return this.save();
};

chatSessionSchema.methods.restore = function () {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  this.status = 'active';
  return this.save();
};

chatSessionSchema.methods.generateShareToken = function (expiresIn = 24 * 60 * 60 * 1000) {
  this.access.shareToken = `share_${uuidv4().replace(/-/g, '')}`;
  this.access.shareExpiresAt = new Date(Date.now() + expiresIn);
  return this.save();
};

chatSessionSchema.methods.revokeShareToken = function () {
  this.access.shareToken = undefined;
  this.access.shareExpiresAt = undefined;
  return this.save();
};

chatSessionSchema.methods.shareWith = function (userId, permission = 'read') {
  const existingShare = this.access.sharedWith.find(
    (share) => share.userId.toString() === userId.toString(),
  );

  if (existingShare) {
    existingShare.permission = permission;
    existingShare.sharedAt = new Date();
  } else {
    this.access.sharedWith.push({
      userId,
      permission,
      sharedAt: new Date(),
    });
  }

  return this.save();
};

chatSessionSchema.methods.unshareWith = function (userId) {
  this.access.sharedWith = this.access.sharedWith.filter(
    (share) => share.userId.toString() !== userId.toString(),
  );

  return this.save();
};

chatSessionSchema.methods.hasAccess = function (userId, permission = 'read') {
  // 检查是否为所有者
  if (this.userId.toString() === userId.toString()) {
    return true;
  }

  // 检查是否为公开会话（只读权限）
  if (this.access.isPublic && permission === 'read') {
    return true;
  }

  // 检查共享权限
  const sharedAccess = this.access.sharedWith.find(
    (share) => share.userId.toString() === userId.toString(),
  );

  if (!sharedAccess) {
    return false;
  }

  // 权限级别检查
  const permissionLevels = {
    read: 1,
    write: 2,
  };

  const userLevel = permissionLevels[sharedAccess.permission] || 0;
  const requiredLevel = permissionLevels[permission] || 0;

  return userLevel >= requiredLevel;
};

chatSessionSchema.methods.getContext = function (messageCount = 5) {
  // 获取最近的消息作为上下文
  const recentMessages = this.messages
    .slice(-messageCount)
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

  return recentMessages;
};

chatSessionSchema.methods.clearMessages = function () {
  this.messages = [];
  this.stats.messageCount = 0;
  this.stats.totalTokensUsed = 0;
  this.stats.totalCost = 0;
  this.stats.searchCount = 0;
  this.stats.lastMessageAt = undefined;
  this.stats.sessionDuration = 0;

  return this.save();
};

// 静态方法
chatSessionSchema.statics.findByUser = function (userId, options = {}) {
  const {
    status,
    knowledgeBaseId,
    limit = 20,
    skip = 0,
    sort = { 'stats.lastMessageAt': -1, createdAt: -1 },
    includeArchived = false,
  } = options;

  const query = { userId };

  if (status) {
    query.status = status;
  }

  if (knowledgeBaseId) {
    query.knowledgeBaseId = knowledgeBaseId;
  }

  if (!includeArchived) {
    query.isArchived = { $ne: true };
  }

  return this.find(query)
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

chatSessionSchema.statics.findBySessionId = function (sessionId) {
  return this.findOne({ sessionId });
};

chatSessionSchema.statics.findByShareToken = function (shareToken) {
  return this.findOne({
    'access.shareToken': shareToken,
    'access.shareExpiresAt': { $gt: new Date() },
    isDeleted: false,
  });
};

chatSessionSchema.statics.findByKnowledgeBase = function (knowledgeBaseId, options = {}) {
  const {
    status,
    limit = 20,
    skip = 0,
    sort = { 'stats.lastMessageAt': -1 },
  } = options;

  const query = { knowledgeBaseId };

  if (status) {
    query.status = status;
  }

  return this.find(query)
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

chatSessionSchema.statics.search = function (searchTerm, options = {}) {
  const {
    userId,
    knowledgeBaseId,
    tags,
    category,
    limit = 20,
    skip = 0,
  } = options;

  const query = {
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { 'messages.content': { $regex: searchTerm, $options: 'i' } },
    ],
    isDeleted: false,
  };

  if (userId) {
    query.userId = userId;
  }

  if (knowledgeBaseId) {
    query.knowledgeBaseId = knowledgeBaseId;
  }

  if (tags && tags.length > 0) {
    query.tags = { $in: tags };
  }

  if (category) {
    query.category = category;
  }

  return this.find(query)
    .sort({ 'stats.lastMessageAt': -1 })
    .limit(limit)
    .skip(skip);
};

chatSessionSchema.statics.getStatistics = function (filters = {}) {
  const pipeline = [
    {
      $match: {
        isDeleted: false,
        ...filters,
      },
    },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        totalMessages: { $sum: '$stats.messageCount' },
        totalTokensUsed: { $sum: '$stats.totalTokensUsed' },
        totalCost: { $sum: '$stats.totalCost' },
        totalSearches: { $sum: '$stats.searchCount' },
        activeSessions: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
        },
        archivedSessions: {
          $sum: { $cond: [{ $eq: ['$isArchived', true] }, 1, 0] },
        },
        avgMessagesPerSession: { $avg: '$stats.messageCount' },
        avgTokensPerSession: { $avg: '$stats.totalTokensUsed' },
        avgCostPerSession: { $avg: '$stats.totalCost' },
        avgSessionDuration: { $avg: '$stats.sessionDuration' },
      },
    },
  ];

  return this.aggregate(pipeline);
};

chatSessionSchema.statics.cleanupExpiredShares = function () {
  return this.updateMany(
    {
      'access.shareExpiresAt': { $lt: new Date() },
    },
    {
      $unset: {
        'access.shareToken': 1,
        'access.shareExpiresAt': 1,
      },
    },
  );
};

module.exports = mongoose.model('ChatSession', chatSessionSchema);
