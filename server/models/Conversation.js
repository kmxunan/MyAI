const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * 对话模型
 * 用于存储用户的聊天对话信息
 */
const conversationSchema = new Schema({
  // 基本信息
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  
  title: {
    type: String,
    required: [true, 'Title is required'],
    maxlength: [200, 'Title cannot exceed 200 characters'],
    trim: true
  },
  
  type: {
    type: String,
    enum: ['chat', 'business', 'rag', 'code', 'creative'],
    default: 'chat',
    required: true
  },
  
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active',
    index: true
  },
  
  // 模型配置
  model: {
    provider: {
      type: String,
      required: true,
      maxlength: [50, 'Provider name cannot exceed 50 characters']
    },
    name: {
      type: String,
      required: true
    },
    version: String
  },
  
  // 系统提示词
  systemPrompt: {
    type: String,
    maxlength: [5000, 'System prompt cannot exceed 5000 characters']
  },
  
  // 对话设置
  settings: {
    temperature: {
      type: Number,
      min: 0,
      max: 2,
      default: 0.7
    },
    maxTokens: {
      type: Number,
      min: 1,
      max: 8192,
      default: 2048
    },
    topP: {
      type: Number,
      min: 0,
      max: 1,
      default: 1
    },
    frequencyPenalty: {
      type: Number,
      min: -2,
      max: 2,
      default: 0
    },
    presencePenalty: {
      type: Number,
      min: -2,
      max: 2,
      default: 0
    }
  },
  
  // RAG配置
  ragConfig: {
    knowledgeBaseId: {
      type: String,
      index: true
    },
    searchType: {
      type: String,
      enum: ['semantic', 'keyword', 'hybrid'],
      default: 'semantic'
    },
    maxResults: {
      type: Number,
      min: 1,
      max: 20,
      default: 5
    },
    threshold: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.7
    }
  },
  
  // 业务上下文
  businessContext: {
    department: String,
    project: String,
    tags: [String],
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    }
  },
  
  // 统计信息
  stats: {
    messageCount: {
      type: Number,
      default: 0
    },
    totalTokens: {
      type: Number,
      default: 0
    },
    totalCost: {
      type: Number,
      default: 0
    },
    lastMessageAt: {
      type: Date,
      index: true
    },
    avgResponseTime: {
      type: Number,
      default: 0
    }
  },
  
  // 共享设置
  sharing: {
    isPublic: {
      type: Boolean,
      default: false
    },
    shareToken: {
      type: String,
      unique: true,
      sparse: true
    },
    allowedUsers: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    permissions: {
      canView: {
        type: Boolean,
        default: true
      },
      canComment: {
        type: Boolean,
        default: false
      },
      canEdit: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // 元数据
  metadata: {
    source: {
      type: String,
      enum: ['web', 'mobile', 'api', 'import'],
      default: 'web'
    },
    userAgent: String,
    ipAddress: String,
    language: {
      type: String,
      default: 'zh-CN'
    },
    timezone: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟属性
conversationSchema.virtual('duration').get(function() {
  if (this.stats.lastMessageAt) {
    return this.stats.lastMessageAt - this.createdAt;
  }
  return null;
});

conversationSchema.virtual('isActive').get(function() {
  return this.status === 'active';
});

conversationSchema.virtual('modelDisplay').get(function() {
  return `${this.model.provider}/${this.model.name}`;
});

// 索引
conversationSchema.index({ user: 1, createdAt: -1 });
conversationSchema.index({ user: 1, status: 1 });
conversationSchema.index({ type: 1, status: 1 });
conversationSchema.index({ 'stats.lastMessageAt': -1 });
conversationSchema.index({ 'ragConfig.knowledgeBaseId': 1 });
conversationSchema.index({ 'sharing.shareToken': 1 }, { sparse: true });
conversationSchema.index({ 'businessContext.tags': 1 });

// 复合索引
conversationSchema.index({ user: 1, type: 1, status: 1 });
conversationSchema.index({ user: 1, 'stats.lastMessageAt': -1 });

// 中间件
conversationSchema.pre('save', function(next) {
  // 如果是新文档且没有设置lastMessageAt，设置为当前时间
  if (this.isNew && !this.stats.lastMessageAt) {
    this.stats.lastMessageAt = new Date();
  }
  next();
});

// 软删除中间件
conversationSchema.pre(/^find/, function(next) {
  // 默认不返回已删除的对话
  if (!this.getQuery().status) {
    this.where({ status: { $ne: 'deleted' } });
  }
  next();
});

// 实例方法
conversationSchema.methods.updateStats = function(stats) {
  if (stats.tokens) {
    this.stats.totalTokens += stats.tokens;
  }
  if (stats.cost) {
    this.stats.totalCost += stats.cost;
  }
  if (stats.responseTime) {
    // 计算平均响应时间
    const currentAvg = this.stats.avgResponseTime || 0;
    const messageCount = this.stats.messageCount || 0;
    this.stats.avgResponseTime = Math.round(
      (currentAvg * messageCount + stats.responseTime) / (messageCount + 1)
    );
  }
  this.stats.messageCount += 1;
  this.stats.lastMessageAt = new Date();
  
  return this.save();
};

conversationSchema.methods.archive = function() {
  this.status = 'archived';
  return this.save();
};

conversationSchema.methods.restore = function() {
  this.status = 'active';
  return this.save();
};

conversationSchema.methods.softDelete = function() {
  this.status = 'deleted';
  return this.save();
};

conversationSchema.methods.generateShareToken = function() {
  const crypto = require('crypto');
  this.sharing.shareToken = crypto.randomBytes(32).toString('hex');
  return this.save();
};

// 静态方法
conversationSchema.statics.findByUser = function(userId, options = {}) {
  const query = { user: userId };
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.status) {
    query.status = options.status;
  }
  
  return this.find(query)
    .sort({ 'stats.lastMessageAt': -1 })
    .limit(options.limit || 20)
    .skip(options.offset || 0);
};

conversationSchema.statics.getStats = function(userId) {
  return this.aggregate([
    { $match: { user: mongoose.Types.ObjectId(userId), status: 'active' } },
    {
      $group: {
        _id: null,
        totalConversations: { $sum: 1 },
        totalMessages: { $sum: '$stats.messageCount' },
        totalTokens: { $sum: '$stats.totalTokens' },
        totalCost: { $sum: '$stats.totalCost' },
        avgResponseTime: { $avg: '$stats.avgResponseTime' }
      }
    }
  ]);
};

module.exports = mongoose.model('Conversation', conversationSchema);