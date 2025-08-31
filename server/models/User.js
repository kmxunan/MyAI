const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  // 基本信息
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // 默认不返回密码字段
  },
  
  // 个人信息
  firstName: {
    type: String,
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  
  lastName: {
    type: String,
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  
  avatar: {
    type: String,
    default: null
  },
  
  phone: {
    type: String,
    trim: true,
    match: [/^[+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number']
  },
  
  // 角色和权限
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator', 'business_user'],
    default: 'user'
  },
  
  roles: [{
    type: String,
    enum: ['user', 'admin', 'moderator', 'business_user', 'api_user']
  }],
  
  permissions: [{
    type: String,
    enum: [
      'chat:read', 'chat:write', 'chat:delete',
      'biz:customers:read', 'biz:customers:write', 'biz:customers:delete',
      'biz:projects:read', 'biz:projects:write', 'biz:projects:delete',
      'biz:contracts:read', 'biz:contracts:write', 'biz:contracts:delete',
      'biz:finance:read', 'biz:finance:write', 'biz:finance:delete',
      'rag:read', 'rag:write', 'rag:delete',
      'admin:users', 'admin:system', 'admin:logs'
    ]
  }],
  
  // 账户状态
  isActive: {
    type: Boolean,
    default: true
  },
  
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // 密码重置
  passwordResetToken: String,
  passwordResetExpires: Date,
  passwordChangedAt: Date,
  
  // API 密钥
  apiKey: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // 偏好设置
  preferences: {
    language: {
      type: String,
      enum: ['en', 'zh', 'zh-CN', 'zh-TW'],
      default: 'zh-CN'
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    },
    timezone: {
      type: String,
      default: 'Asia/Shanghai'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    }
  },

  // 用户设置（包含AI设置）
  settings: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    language: {
      type: String,
      enum: ['zh-CN', 'en-US', 'ja-JP'],
      default: 'zh-CN'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: false
      },
      sms: {
        type: Boolean,
        default: false
      }
    },
    privacy: {
      profileVisible: {
        type: Boolean,
        default: true
      },
      activityVisible: {
        type: Boolean,
        default: false
      },
      dataCollection: {
        type: Boolean,
        default: true
      }
    },
    ai: {
      defaultModel: {
        type: String,
        default: 'openai/gpt-3.5-turbo'
      },
      temperature: {
        type: Number,
        min: 0,
        max: 2,
        default: 0.7
      },
      maxTokens: {
        type: Number,
        min: 1,
        max: 32000,
        default: 2048
      },
      streamResponse: {
        type: Boolean,
        default: true
      }
    }
  },
  
  // AI 使用统计
  aiUsage: {
    totalTokens: {
      type: Number,
      default: 0
    },
    totalRequests: {
      type: Number,
      default: 0
    },
    monthlyTokens: {
      type: Number,
      default: 0
    },
    monthlyRequests: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    }
  },
  
  // 订阅信息
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'pro', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled', 'expired'],
      default: 'active'
    },
    startDate: Date,
    endDate: Date,
    tokenLimit: {
      type: Number,
      default: 10000
    },
    requestLimit: {
      type: Number,
      default: 100
    }
  },
  
  // 登录信息
  lastLogin: Date,
  loginCount: {
    type: Number,
    default: 0
  },
  
  // 安全信息
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  
  twoFactorSecret: String,
  
  loginAttempts: {
    type: Number,
    default: 0
  },
  
  lockUntil: Date,
  
  // 元数据
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段
userSchema.virtual('fullName').get(function() {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// 索引
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ apiKey: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });

// 中间件：保存前加密密码
userSchema.pre('save', async function(next) {
  // 只有密码被修改时才加密
  if (!this.isModified('password')) return next();
  
  try {
    // 加密密码
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    
    // 设置密码修改时间
    this.passwordChangedAt = Date.now() - 1000; // 减去1秒确保JWT在密码修改后创建
    
    next();
  } catch (error) {
    next(error);
  }
});

// 中间件：保存前生成API密钥
userSchema.pre('save', function(next) {
  if (this.isNew && !this.apiKey) {
    this.apiKey = `myai_${uuidv4().replace(/-/g, '')}`;
  }
  next();
});

// 实例方法：验证密码
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 实例方法：检查密码是否在JWT签发后修改
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// 实例方法：创建密码重置令牌
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10分钟
  
  return resetToken;
};

// 实例方法：创建邮箱验证令牌
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24小时
  
  return verificationToken;
};

// 实例方法：增加登录尝试次数
userSchema.methods.incLoginAttempts = function() {
  // 如果之前有锁定且已过期，重置计数器
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // 如果达到最大尝试次数且未锁定，则锁定账户
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 锁定2小时
  }
  
  return this.updateOne(updates);
};

// 实例方法：重置登录尝试
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// 实例方法：检查权限
userSchema.methods.hasPermission = function(permission) {
  // 管理员拥有所有权限
  if (this.role === 'admin' || this.roles?.includes('admin')) {
    return true;
  }
  
  return this.permissions?.includes(permission) || false;
};

// 实例方法：检查角色
userSchema.methods.hasRole = function(role) {
  return this.role === role || this.roles?.includes(role) || false;
};

// 实例方法：更新AI使用统计
userSchema.methods.updateAIUsage = function(tokens, requests = 1) {
  const now = new Date();
  const lastReset = new Date(this.aiUsage.lastResetDate);
  
  // 检查是否需要重置月度统计
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.aiUsage.monthlyTokens = 0;
    this.aiUsage.monthlyRequests = 0;
    this.aiUsage.lastResetDate = now;
  }
  
  this.aiUsage.totalTokens += tokens;
  this.aiUsage.totalRequests += requests;
  this.aiUsage.monthlyTokens += tokens;
  this.aiUsage.monthlyRequests += requests;
  
  return this.save();
};

// 静态方法：根据邮箱或用户名查找用户
userSchema.statics.findByEmailOrUsername = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier }
    ]
  });
};

module.exports = mongoose.model('User', userSchema);