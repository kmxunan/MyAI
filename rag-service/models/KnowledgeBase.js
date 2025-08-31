const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const knowledgeBaseSchema = new mongoose.Schema({
  // 基本信息
  name: {
    type: String,
    required: [true, 'Knowledge base name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },

  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters'],
  },

  // 唯一标识
  knowledgeBaseId: {
    type: String,
    unique: true,
    default: () => `kb_${uuidv4().replace(/-/g, '')}`,
  },

  // 所有者信息
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },

  // 配置信息
  settings: {
    // 嵌入模型配置
    embeddingModel: {
      type: String,
      default: 'text-embedding-ada-002',
      enum: [
        'text-embedding-ada-002',
        'text-embedding-3-small',
        'text-embedding-3-large',
      ],
    },

    // 分块配置
    chunkSize: {
      type: Number,
      default: 1000,
      min: [100, 'Chunk size must be at least 100'],
      max: [4000, 'Chunk size cannot exceed 4000'],
    },

    chunkOverlap: {
      type: Number,
      default: 200,
      min: [0, 'Chunk overlap cannot be negative'],
      max: [1000, 'Chunk overlap cannot exceed 1000'],
    },

    // 搜索配置
    searchSettings: {
      defaultSearchType: {
        type: String,
        default: 'hybrid',
        enum: ['semantic', 'keyword', 'hybrid'],
      },

      minRelevanceScore: {
        type: Number,
        default: 0.7,
        min: [0, 'Min relevance score cannot be negative'],
        max: [1, 'Min relevance score cannot exceed 1'],
      },

      maxResults: {
        type: Number,
        default: 10,
        min: [1, 'Max results must be at least 1'],
        max: [100, 'Max results cannot exceed 100'],
      },

      hybridSearchAlpha: {
        type: Number,
        default: 0.7,
        min: [0, 'Hybrid search alpha cannot be negative'],
        max: [1, 'Hybrid search alpha cannot exceed 1'],
      },
    },

    // 聊天配置
    chatSettings: {
      defaultModel: {
        type: String,
        default: 'openai/gpt-3.5-turbo',
      },

      temperature: {
        type: Number,
        default: 0.7,
        min: [0, 'Temperature cannot be negative'],
        max: [2, 'Temperature cannot exceed 2'],
      },

      maxTokens: {
        type: Number,
        default: 2000,
        min: [100, 'Max tokens must be at least 100'],
        max: [8000, 'Max tokens cannot exceed 8000'],
      },

      maxContextChunks: {
        type: Number,
        default: 5,
        min: [1, 'Max context chunks must be at least 1'],
        max: [20, 'Max context chunks cannot exceed 20'],
      },

      systemPrompt: {
        type: String,
        default: 'You are a helpful AI assistant that answers questions based on the provided context.',
        maxlength: [1000, 'System prompt cannot exceed 1000 characters'],
      },
    },
  },

  // 统计信息
  stats: {
    documentCount: {
      type: Number,
      default: 0,
      min: [0, 'Document count cannot be negative'],
    },

    chunkCount: {
      type: Number,
      default: 0,
      min: [0, 'Chunk count cannot be negative'],
    },

    totalSize: {
      type: Number,
      default: 0,
      min: [0, 'Total size cannot be negative'],
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
    },

    searchCount: {
      type: Number,
      default: 0,
      min: [0, 'Search count cannot be negative'],
    },

    chatCount: {
      type: Number,
      default: 0,
      min: [0, 'Chat count cannot be negative'],
    },
  },

  // 访问控制
  access: {
    isPublic: {
      type: Boolean,
      default: false,
    },

    allowedUsers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      permission: {
        type: String,
        enum: ['read', 'write', 'admin'],
        default: 'read',
      },
      grantedAt: {
        type: Date,
        default: Date.now,
      },
      grantedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    }],

    apiKeys: [{
      keyId: {
        type: String,
        unique: true,
        default: () => `kb_key_${uuidv4().replace(/-/g, '')}`,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      hashedKey: {
        type: String,
        required: true,
      },
      permissions: [{
        type: String,
        enum: ['search', 'chat', 'upload', 'delete'],
      }],
      isActive: {
        type: Boolean,
        default: true,
      },
      expiresAt: {
        type: Date,
      },
      lastUsed: {
        type: Date,
      },
      usageCount: {
        type: Number,
        default: 0,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    }],
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

  // 状态管理
  status: {
    type: String,
    enum: ['active', 'inactive', 'processing', 'error'],
    default: 'active',
  },

  // 版本控制
  version: {
    type: Number,
    default: 1,
  },

  // 备份和恢复
  backup: {
    lastBackupAt: {
      type: Date,
    },
    backupLocation: {
      type: String,
    },
    autoBackup: {
      type: Boolean,
      default: false,
    },
    backupFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly',
    },
  },

  // 元数据
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map(),
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// 虚拟字段
knowledgeBaseSchema.virtual('documentsPerChunk').get(function () {
  if (this.stats.chunkCount === 0) return 0;
  return (this.stats.chunkCount / this.stats.documentCount).toFixed(2);
});

knowledgeBaseSchema.virtual('averageDocumentSize').get(function () {
  if (this.stats.documentCount === 0) return 0;
  return Math.round(this.stats.totalSize / this.stats.documentCount);
});

knowledgeBaseSchema.virtual('isOwner').get(function () {
  return function (userId) {
    return this.userId.toString() === userId.toString();
  }.bind(this);
});

// 索引
knowledgeBaseSchema.index({ userId: 1, createdAt: -1 });
knowledgeBaseSchema.index({ status: 1 });
knowledgeBaseSchema.index({ 'access.isPublic': 1 });
knowledgeBaseSchema.index({ tags: 1 });
knowledgeBaseSchema.index({ category: 1 });
knowledgeBaseSchema.index({ 'stats.lastUpdated': -1 });

// 中间件
knowledgeBaseSchema.pre('save', function (next) {
  // 更新版本号
  if (this.isModified() && !this.isNew) {
    this.version += 1;
  }

  // 更新统计信息的最后更新时间
  if (this.isModified('stats')) {
    this.stats.lastUpdated = new Date();
  }

  next();
});

// 实例方法
knowledgeBaseSchema.methods.hasPermission = function (userId, permission = 'read') {
  // 检查是否为所有者
  if (this.userId.toString() === userId.toString()) {
    return true;
  }

  // 检查是否为公开知识库（只读权限）
  if (this.access.isPublic && permission === 'read') {
    return true;
  }

  // 检查用户权限
  const userAccess = this.access.allowedUsers.find(
    (user) => user.userId.toString() === userId.toString(),
  );

  if (!userAccess) {
    return false;
  }

  // 权限级别检查
  const permissionLevels = {
    read: 1,
    write: 2,
    admin: 3,
  };

  const userLevel = permissionLevels[userAccess.permission] || 0;
  const requiredLevel = permissionLevels[permission] || 0;

  return userLevel >= requiredLevel;
};

knowledgeBaseSchema.methods.grantAccess = function (userId, permission, grantedBy) {
  // 检查用户是否已有权限
  const existingAccess = this.access.allowedUsers.find(
    (user) => user.userId.toString() === userId.toString(),
  );

  if (existingAccess) {
    existingAccess.permission = permission;
    existingAccess.grantedAt = new Date();
    existingAccess.grantedBy = grantedBy;
  } else {
    this.access.allowedUsers.push({
      userId,
      permission,
      grantedBy,
      grantedAt: new Date(),
    });
  }

  return this.save();
};

knowledgeBaseSchema.methods.revokeAccess = function (userId) {
  this.access.allowedUsers = this.access.allowedUsers.filter(
    (user) => user.userId.toString() !== userId.toString(),
  );

  return this.save();
};

knowledgeBaseSchema.methods.createApiKey = function (name, permissions, expiresAt) {
  const bcrypt = require('bcryptjs');
  const crypto = require('crypto');

  // 生成API密钥
  const apiKey = crypto.randomBytes(32).toString('hex');
  const hashedKey = bcrypt.hashSync(apiKey, 10);

  const keyData = {
    name,
    hashedKey,
    permissions: permissions || ['search', 'chat'],
    expiresAt,
  };

  this.access.apiKeys.push(keyData);

  return this.save().then(() => ({
    keyId: this.access.apiKeys[this.access.apiKeys.length - 1].keyId,
    apiKey, // 只在创建时返回明文密钥
  }));
};

knowledgeBaseSchema.methods.validateApiKey = function (apiKey, requiredPermission) {
  const bcrypt = require('bcryptjs');

  for (const key of this.access.apiKeys) {
    if (!key.isActive) continue;

    // 检查是否过期
    if (key.expiresAt && key.expiresAt < new Date()) {
      key.isActive = false;
      continue;
    }

    // 验证密钥
    if (bcrypt.compareSync(apiKey, key.hashedKey)) {
      // 检查权限
      if (requiredPermission && !key.permissions.includes(requiredPermission)) {
        return { valid: false, reason: 'insufficient_permissions' };
      }

      // 更新使用统计
      key.lastUsed = new Date();
      key.usageCount += 1;
      this.save();

      return { valid: true, keyId: key.keyId };
    }
  }

  return { valid: false, reason: 'invalid_key' };
};

knowledgeBaseSchema.methods.revokeApiKey = function (keyId) {
  const key = this.access.apiKeys.find((k) => k.keyId === keyId);
  if (key) {
    key.isActive = false;
  }
  return this.save();
};

knowledgeBaseSchema.methods.updateStats = function (updates) {
  Object.assign(this.stats, updates);
  this.stats.lastUpdated = new Date();
  return this.save();
};

knowledgeBaseSchema.methods.incrementSearchCount = function () {
  this.stats.searchCount += 1;
  return this.save();
};

knowledgeBaseSchema.methods.incrementChatCount = function () {
  this.stats.chatCount += 1;
  return this.save();
};

knowledgeBaseSchema.methods.addDocument = function (documentSize) {
  this.stats.documentCount += 1;
  this.stats.totalSize += documentSize;
  this.stats.lastUpdated = new Date();
  return this.save();
};

knowledgeBaseSchema.methods.removeDocument = function (documentSize, chunkCount = 0) {
  this.stats.documentCount = Math.max(0, this.stats.documentCount - 1);
  this.stats.totalSize = Math.max(0, this.stats.totalSize - documentSize);
  this.stats.chunkCount = Math.max(0, this.stats.chunkCount - chunkCount);
  this.stats.lastUpdated = new Date();
  return this.save();
};

knowledgeBaseSchema.methods.addChunks = function (chunkCount) {
  this.stats.chunkCount += chunkCount;
  this.stats.lastUpdated = new Date();
  return this.save();
};

// 静态方法
knowledgeBaseSchema.statics.findByUser = function (userId, options = {}) {
  const {
    includePublic = false,
    status = 'active',
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 },
  } = options;

  const query = {
    $or: [
      { userId },
      { 'access.allowedUsers.userId': userId },
    ],
  };

  if (includePublic) {
    query.$or.push({ 'access.isPublic': true });
  }

  if (status) {
    query.status = status;
  }

  return this.find(query)
    .populate('userId', 'username email')
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

knowledgeBaseSchema.statics.findByKnowledgeBaseId = function (knowledgeBaseId) {
  return this.findOne({ knowledgeBaseId })
    .populate('userId', 'username email');
};

knowledgeBaseSchema.statics.search = function (searchTerm, options = {}) {
  const {
    userId,
    includePublic = true,
    limit = 20,
    skip = 0,
  } = options;

  const query = {
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { tags: { $in: [new RegExp(searchTerm, 'i')] } },
      { category: { $regex: searchTerm, $options: 'i' } },
    ],
    status: 'active',
  };

  // 权限过滤
  const accessQuery = [];

  if (includePublic) {
    accessQuery.push({ 'access.isPublic': true });
  }

  if (userId) {
    accessQuery.push(
      { userId },
      { 'access.allowedUsers.userId': userId },
    );
  }

  if (accessQuery.length > 0) {
    query.$and = [{ $or: accessQuery }];
  }

  return this.find(query)
    .populate('userId', 'username email')
    .sort({ 'stats.lastUpdated': -1 })
    .limit(limit)
    .skip(skip);
};

knowledgeBaseSchema.statics.getPublicKnowledgeBases = function (options = {}) {
  const {
    category,
    tags,
    limit = 20,
    skip = 0,
  } = options;

  const query = {
    'access.isPublic': true,
    status: 'active',
  };

  if (category) {
    query.category = category;
  }

  if (tags && tags.length > 0) {
    query.tags = { $in: tags };
  }

  return this.find(query)
    .populate('userId', 'username')
    .sort({ 'stats.searchCount': -1, 'stats.lastUpdated': -1 })
    .limit(limit)
    .skip(skip);
};

knowledgeBaseSchema.statics.getStatistics = function (userId) {
  const pipeline = [
    {
      $match: userId ? { userId: new mongoose.Types.ObjectId(userId) } : {},
    },
    {
      $group: {
        _id: null,
        totalKnowledgeBases: { $sum: 1 },
        totalDocuments: { $sum: '$stats.documentCount' },
        totalChunks: { $sum: '$stats.chunkCount' },
        totalSize: { $sum: '$stats.totalSize' },
        totalSearches: { $sum: '$stats.searchCount' },
        totalChats: { $sum: '$stats.chatCount' },
        activeKnowledgeBases: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
        },
        publicKnowledgeBases: {
          $sum: { $cond: ['$access.isPublic', 1, 0] },
        },
      },
    },
  ];

  return this.aggregate(pipeline);
};

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
