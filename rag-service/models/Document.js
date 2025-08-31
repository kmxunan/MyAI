const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const documentSchema = new mongoose.Schema({
  // 基本信息
  filename: {
    type: String,
    required: [true, 'Filename is required'],
    trim: true,
    maxlength: [255, 'Filename cannot exceed 255 characters'],
  },

  originalName: {
    type: String,
    required: [true, 'Original name is required'],
    trim: true,
  },

  // 唯一标识
  documentId: {
    type: String,
    unique: true,
    default: () => `doc_${uuidv4().replace(/-/g, '')}`,
  },

  // 关联信息
  knowledgeBaseId: {
    type: String,
    required: [true, 'Knowledge base ID is required'],
    index: true,
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true,
  },

  // 文件信息
  fileInfo: {
    mimetype: {
      type: String,
      required: [true, 'MIME type is required'],
    },

    size: {
      type: Number,
      required: [true, 'File size is required'],
      min: [0, 'File size cannot be negative'],
    },

    encoding: {
      type: String,
      default: 'utf-8',
    },

    extension: {
      type: String,
      trim: true,
      lowercase: true,
    },

    checksum: {
      type: String,
      index: true, // 用于检测重复文件
    },
  },

  // 处理信息
  processing: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },

    startedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    error: {
      message: String,
      stack: String,
      code: String,
    },

    progress: {
      type: Number,
      min: [0, 'Progress cannot be negative'],
      max: [100, 'Progress cannot exceed 100'],
      default: 0,
    },

    processingTime: {
      type: Number, // 处理时间（毫秒）
      min: [0, 'Processing time cannot be negative'],
    },
  },

  // 内容信息
  content: {
    extractedText: {
      type: String,
      select: false, // 默认不返回，需要时显式选择
    },

    textLength: {
      type: Number,
      min: [0, 'Text length cannot be negative'],
      default: 0,
    },

    language: {
      type: String,
      default: 'unknown',
    },

    encoding: {
      type: String,
      default: 'utf-8',
    },
  },

  // 分块信息
  chunks: {
    count: {
      type: Number,
      min: [0, 'Chunk count cannot be negative'],
      default: 0,
    },

    settings: {
      chunkSize: {
        type: Number,
        default: 1000,
      },

      chunkOverlap: {
        type: Number,
        default: 200,
      },

      splittingMethod: {
        type: String,
        enum: ['sentence', 'paragraph', 'fixed'],
        default: 'sentence',
      },
    },

    // 分块统计
    stats: {
      minChunkSize: Number,
      maxChunkSize: Number,
      avgChunkSize: Number,
      totalTokens: Number,
    },
  },

  // 嵌入信息
  embedding: {
    model: {
      type: String,
      default: 'text-embedding-ada-002',
    },

    dimensions: {
      type: Number,
      default: 1536,
    },

    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },

    generatedAt: {
      type: Date,
    },

    cost: {
      type: Number,
      min: [0, 'Cost cannot be negative'],
      default: 0,
    },

    tokensUsed: {
      type: Number,
      min: [0, 'Tokens used cannot be negative'],
      default: 0,
    },
  },

  // 向量数据库信息
  vectorDB: {
    collectionName: {
      type: String,
      index: true,
    },

    vectorIds: [{
      type: String,
    }],

    insertedAt: {
      type: Date,
    },

    status: {
      type: String,
      enum: ['pending', 'inserted', 'failed'],
      default: 'pending',
    },
  },

  // 元数据
  metadata: {
    // 文档属性
    title: String,
    author: String,
    subject: String,
    keywords: [String],

    // 创建信息
    createdDate: Date,
    modifiedDate: Date,

    // 自定义标签
    tags: [{
      type: String,
      trim: true,
      maxlength: [50, 'Tag cannot exceed 50 characters'],
    }],

    // 分类
    category: {
      type: String,
      trim: true,
      maxlength: [50, 'Category cannot exceed 50 characters'],
    },

    // 自定义字段
    custom: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map(),
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
        enum: ['read', 'write'],
        default: 'read',
      },
      grantedAt: {
        type: Date,
        default: Date.now,
      },
    }],
  },

  // 统计信息
  stats: {
    viewCount: {
      type: Number,
      default: 0,
      min: [0, 'View count cannot be negative'],
    },

    searchCount: {
      type: Number,
      default: 0,
      min: [0, 'Search count cannot be negative'],
    },

    lastAccessed: {
      type: Date,
    },

    downloadCount: {
      type: Number,
      default: 0,
      min: [0, 'Download count cannot be negative'],
    },
  },

  // 版本控制
  version: {
    type: Number,
    default: 1,
  },

  // 状态管理
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },

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
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// 虚拟字段
documentSchema.virtual('fileType').get(function () {
  return this.fileInfo.extension || this.fileInfo.mimetype.split('/')[1];
});

documentSchema.virtual('sizeInMB').get(function () {
  return (this.fileInfo.size / (1024 * 1024)).toFixed(2);
});

documentSchema.virtual('processingDuration').get(function () {
  if (this.processing.startedAt && this.processing.completedAt) {
    return this.processing.completedAt - this.processing.startedAt;
  }
  return null;
});

documentSchema.virtual('isProcessed').get(function () {
  return this.processing.status === 'completed';
});

documentSchema.virtual('hasEmbeddings').get(function () {
  return this.embedding.status === 'completed';
});

documentSchema.virtual('isInVectorDB').get(function () {
  return this.vectorDB.status === 'inserted';
});

// 索引
documentSchema.index({ knowledgeBaseId: 1, createdAt: -1 });
documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ documentId: 1 }, { unique: true });
documentSchema.index({ 'processing.status': 1 });
documentSchema.index({ 'embedding.status': 1 });
documentSchema.index({ 'vectorDB.status': 1 });
documentSchema.index({ 'fileInfo.checksum': 1 });
documentSchema.index({ 'metadata.tags': 1 });
documentSchema.index({ 'metadata.category': 1 });
documentSchema.index({ isActive: 1, isDeleted: 1 });

// 复合索引
documentSchema.index({ knowledgeBaseId: 1, isActive: 1, isDeleted: 1 });
documentSchema.index({ userId: 1, 'processing.status': 1 });

// 中间件
documentSchema.pre('save', function (next) {
  // 更新版本号
  if (this.isModified() && !this.isNew) {
    this.version += 1;
  }

  // 设置文件扩展名
  if (this.isModified('filename') && !this.fileInfo.extension) {
    const ext = this.filename.split('.').pop();
    if (ext && ext !== this.filename) {
      this.fileInfo.extension = ext.toLowerCase();
    }
  }

  // 计算处理时间
  if (this.isModified('processing.completedAt') && this.processing.startedAt) {
    this.processing.processingTime = this.processing.completedAt - this.processing.startedAt;
  }

  next();
});

// 软删除中间件
documentSchema.pre(/^find/, function (next) {
  // 默认不返回已删除的文档
  if (!this.getQuery().isDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

// 实例方法
documentSchema.methods.startProcessing = function () {
  this.processing.status = 'processing';
  this.processing.startedAt = new Date();
  this.processing.progress = 0;
  return this.save();
};

documentSchema.methods.completeProcessing = function (extractedText, chunkCount) {
  this.processing.status = 'completed';
  this.processing.completedAt = new Date();
  this.processing.progress = 100;

  if (extractedText) {
    this.content.extractedText = extractedText;
    this.content.textLength = extractedText.length;
  }

  if (chunkCount !== undefined) {
    this.chunks.count = chunkCount;
  }

  return this.save();
};

documentSchema.methods.failProcessing = function (error) {
  this.processing.status = 'failed';
  this.processing.completedAt = new Date();
  this.processing.error = {
    message: error.message,
    stack: error.stack,
    code: error.code,
  };
  return this.save();
};

documentSchema.methods.updateProgress = function (progress) {
  this.processing.progress = Math.max(0, Math.min(100, progress));
  return this.save();
};

documentSchema.methods.startEmbedding = function (model) {
  this.embedding.status = 'processing';
  this.embedding.model = model;
  return this.save();
};

documentSchema.methods.completeEmbedding = function (tokensUsed, cost) {
  this.embedding.status = 'completed';
  this.embedding.generatedAt = new Date();
  this.embedding.tokensUsed = tokensUsed || 0;
  this.embedding.cost = cost || 0;
  return this.save();
};

documentSchema.methods.failEmbedding = function () {
  this.embedding.status = 'failed';
  return this.save();
};

documentSchema.methods.insertToVectorDB = function (collectionName, vectorIds) {
  this.vectorDB.status = 'inserted';
  this.vectorDB.collectionName = collectionName;
  this.vectorDB.vectorIds = vectorIds;
  this.vectorDB.insertedAt = new Date();
  return this.save();
};

documentSchema.methods.failVectorDBInsertion = function () {
  this.vectorDB.status = 'failed';
  return this.save();
};

documentSchema.methods.incrementViewCount = function () {
  this.stats.viewCount += 1;
  this.stats.lastAccessed = new Date();
  return this.save();
};

documentSchema.methods.incrementSearchCount = function () {
  this.stats.searchCount += 1;
  return this.save();
};

documentSchema.methods.incrementDownloadCount = function () {
  this.stats.downloadCount += 1;
  return this.save();
};

documentSchema.methods.softDelete = function (deletedBy) {
  this.isDeleted = true;
  this.isActive = false;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

documentSchema.methods.restore = function () {
  this.isDeleted = false;
  this.isActive = true;
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  return this.save();
};

documentSchema.methods.hasPermission = function (userId, permission = 'read') {
  // 检查是否为所有者
  if (this.userId.toString() === userId.toString()) {
    return true;
  }

  // 检查是否为公开文档（只读权限）
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
  };

  const userLevel = permissionLevels[userAccess.permission] || 0;
  const requiredLevel = permissionLevels[permission] || 0;

  return userLevel >= requiredLevel;
};

documentSchema.methods.grantAccess = function (userId, permission) {
  const existingAccess = this.access.allowedUsers.find(
    (user) => user.userId.toString() === userId.toString(),
  );

  if (existingAccess) {
    existingAccess.permission = permission;
    existingAccess.grantedAt = new Date();
  } else {
    this.access.allowedUsers.push({
      userId,
      permission,
      grantedAt: new Date(),
    });
  }

  return this.save();
};

documentSchema.methods.revokeAccess = function (userId) {
  this.access.allowedUsers = this.access.allowedUsers.filter(
    (user) => user.userId.toString() !== userId.toString(),
  );

  return this.save();
};

documentSchema.methods.updateChunkStats = function (stats) {
  this.chunks.stats = {
    ...this.chunks.stats,
    ...stats,
  };
  return this.save();
};

// 静态方法
documentSchema.statics.findByKnowledgeBase = function (knowledgeBaseId, options = {}) {
  const {
    status,
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 },
    includeContent = false,
  } = options;

  const query = { knowledgeBaseId };

  if (status) {
    query['processing.status'] = status;
  }

  let findQuery = this.find(query)
    .sort(sort)
    .limit(limit)
    .skip(skip);

  if (includeContent) {
    findQuery = findQuery.select('+content.extractedText');
  }

  return findQuery;
};

documentSchema.statics.findByUser = function (userId, options = {}) {
  const {
    knowledgeBaseId,
    status,
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 },
  } = options;

  const query = { userId };

  if (knowledgeBaseId) {
    query.knowledgeBaseId = knowledgeBaseId;
  }

  if (status) {
    query['processing.status'] = status;
  }

  return this.find(query)
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

documentSchema.statics.findByDocumentId = function (documentId) {
  return this.findOne({ documentId });
};

documentSchema.statics.findDuplicates = function (checksum, knowledgeBaseId) {
  return this.find({
    'fileInfo.checksum': checksum,
    knowledgeBaseId,
    isDeleted: false,
  });
};

documentSchema.statics.findPendingProcessing = function (limit = 10) {
  return this.find({
    'processing.status': 'pending',
    isActive: true,
    isDeleted: false,
  })
    .sort({ createdAt: 1 })
    .limit(limit);
};

documentSchema.statics.findFailedProcessing = function (limit = 10) {
  return this.find({
    'processing.status': 'failed',
    isActive: true,
    isDeleted: false,
  })
    .sort({ 'processing.completedAt': -1 })
    .limit(limit);
};

documentSchema.statics.search = function (searchTerm, options = {}) {
  const {
    knowledgeBaseId,
    userId,
    tags,
    category,
    limit = 20,
    skip = 0,
  } = options;

  const query = {
    $or: [
      { filename: { $regex: searchTerm, $options: 'i' } },
      { originalName: { $regex: searchTerm, $options: 'i' } },
      { 'metadata.title': { $regex: searchTerm, $options: 'i' } },
      { 'metadata.author': { $regex: searchTerm, $options: 'i' } },
      { 'metadata.subject': { $regex: searchTerm, $options: 'i' } },
      { 'metadata.keywords': { $in: [new RegExp(searchTerm, 'i')] } },
    ],
    isActive: true,
    isDeleted: false,
  };

  if (knowledgeBaseId) {
    query.knowledgeBaseId = knowledgeBaseId;
  }

  if (userId) {
    query.userId = userId;
  }

  if (tags && tags.length > 0) {
    query['metadata.tags'] = { $in: tags };
  }

  if (category) {
    query['metadata.category'] = category;
  }

  return this.find(query)
    .sort({ 'stats.lastAccessed': -1, createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

documentSchema.statics.getStatistics = function (filters = {}) {
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
        totalDocuments: { $sum: 1 },
        totalSize: { $sum: '$fileInfo.size' },
        totalChunks: { $sum: '$chunks.count' },
        totalViews: { $sum: '$stats.viewCount' },
        totalSearches: { $sum: '$stats.searchCount' },
        totalDownloads: { $sum: '$stats.downloadCount' },
        processedDocuments: {
          $sum: { $cond: [{ $eq: ['$processing.status', 'completed'] }, 1, 0] },
        },
        failedDocuments: {
          $sum: { $cond: [{ $eq: ['$processing.status', 'failed'] }, 1, 0] },
        },
        documentsWithEmbeddings: {
          $sum: { $cond: [{ $eq: ['$embedding.status', 'completed'] }, 1, 0] },
        },
        avgFileSize: { $avg: '$fileInfo.size' },
        avgChunkCount: { $avg: '$chunks.count' },
      },
    },
  ];

  return this.aggregate(pipeline);
};

module.exports = mongoose.model('Document', documentSchema);
