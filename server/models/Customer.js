const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * 客户数据模型
 * 用于管理客户信息和关系
 */
const customerSchema = new Schema({
  // 基本信息
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
    maxlength: [100, 'Customer name cannot exceed 100 characters'],
    index: true
  },
  
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
    index: true
  },
  
  phone: {
    type: String,
    trim: true,
    match: [/^[+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number']
  },
  
  company: {
    type: String,
    trim: true,
    maxlength: [100, 'Company name cannot exceed 100 characters'],
    index: true
  },
  
  // 联系信息
  address: {
    street: {
      type: String,
      trim: true,
      maxlength: [200, 'Street address cannot exceed 200 characters']
    },
    city: {
      type: String,
      trim: true,
      maxlength: [50, 'City name cannot exceed 50 characters']
    },
    state: {
      type: String,
      trim: true,
      maxlength: [50, 'State name cannot exceed 50 characters']
    },
    country: {
      type: String,
      trim: true,
      maxlength: [50, 'Country name cannot exceed 50 characters']
    },
    zipCode: {
      type: String,
      trim: true,
      maxlength: [20, 'Zip code cannot exceed 20 characters']
    },
    full: {
      type: String,
      trim: true,
      maxlength: [500, 'Full address cannot exceed 500 characters']
    }
  },
  
  // 业务信息
  industry: {
    type: String,
    trim: true,
    maxlength: [50, 'Industry cannot exceed 50 characters'],
    index: true
  },
  
  companySize: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
    index: true
  },
  
  website: {
    type: String,
    trim: true,
    maxlength: [200, 'Website URL cannot exceed 200 characters'],
    match: [/^https?:\/\/.+/, 'Please provide a valid website URL']
  },
  
  // 客户状态
  status: {
    type: String,
    enum: ['active', 'inactive', 'prospect', 'archived'],
    default: 'active',
    index: true
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'vip'],
    default: 'medium',
    index: true
  },
  
  // 客户来源
  source: {
    type: String,
    enum: ['website', 'referral', 'social_media', 'advertising', 'cold_call', 'event', 'other'],
    default: 'other',
    index: true
  },
  
  referredBy: {
    type: Schema.Types.ObjectId,
    ref: 'Customer'
  },
  
  // 财务信息
  creditLimit: {
    type: Number,
    min: [0, 'Credit limit cannot be negative'],
    default: 0
  },
  
  paymentTerms: {
    type: String,
    enum: ['net_15', 'net_30', 'net_45', 'net_60', 'due_on_receipt', 'custom'],
    default: 'net_30'
  },
  
  currency: {
    type: String,
    default: 'USD',
    maxlength: [3, 'Currency code must be 3 characters']
  },
  
  // 统计信息
  stats: {
    totalProjects: {
      type: Number,
      default: 0,
      min: 0
    },
    activeProjects: {
      type: Number,
      default: 0,
      min: 0
    },
    totalContracts: {
      type: Number,
      default: 0,
      min: 0
    },
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0
    },
    lastProjectDate: {
      type: Date
    },
    lastContactDate: {
      type: Date
    }
  },
  
  // 联系人信息
  contacts: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Contact name cannot exceed 100 characters']
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Contact title cannot exceed 100 characters']
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number']
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    department: {
      type: String,
      trim: true,
      maxlength: [50, 'Department cannot exceed 50 characters']
    }
  }],
  
  // 标签和分类
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  
  category: {
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters'],
    index: true
  },
  
  // 备注和历史
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes cannot exceed 2000 characters']
  },
  
  internalNotes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Internal notes cannot exceed 2000 characters']
  },
  
  // 社交媒体
  socialMedia: {
    linkedin: {
      type: String,
      trim: true,
      maxlength: [200, 'LinkedIn URL cannot exceed 200 characters']
    },
    twitter: {
      type: String,
      trim: true,
      maxlength: [200, 'Twitter URL cannot exceed 200 characters']
    },
    facebook: {
      type: String,
      trim: true,
      maxlength: [200, 'Facebook URL cannot exceed 200 characters']
    }
  },
  
  // 偏好设置
  preferences: {
    communicationMethod: {
      type: String,
      enum: ['email', 'phone', 'sms', 'in_person'],
      default: 'email'
    },
    language: {
      type: String,
      default: 'en',
      maxlength: [5, 'Language code cannot exceed 5 characters']
    },
    timezone: {
      type: String,
      default: 'UTC',
      maxlength: [50, 'Timezone cannot exceed 50 characters']
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      }
    }
  },
  
  // 关联用户
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // 分配的团队成员
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  // 元数据
  metadata: {
    type: Map,
    of: Schema.Types.Mixed
  },
  
  // 时间戳
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  lastActivityAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // 软删除
  deletedAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 虚拟字段
customerSchema.virtual('fullAddress').get(function() {
  if (this.address && this.address.full) {
    return this.address.full;
  }
  
  const parts = [];
  if (this.address?.street) parts.push(this.address.street);
  if (this.address?.city) parts.push(this.address.city);
  if (this.address?.state) parts.push(this.address.state);
  if (this.address?.country) parts.push(this.address.country);
  if (this.address?.zipCode) parts.push(this.address.zipCode);
  
  return parts.join(', ');
});

customerSchema.virtual('primaryContact').get(function() {
  return this.contacts.find(contact => contact.isPrimary) || this.contacts[0];
});

customerSchema.virtual('isActive').get(function() {
  return this.status === 'active' && !this.deletedAt;
});

// 索引
customerSchema.index({ user: 1, name: 1 });
customerSchema.index({ user: 1, email: 1 });
customerSchema.index({ user: 1, company: 1 });
customerSchema.index({ user: 1, status: 1 });
customerSchema.index({ user: 1, priority: 1 });
customerSchema.index({ user: 1, industry: 1 });
customerSchema.index({ user: 1, source: 1 });
customerSchema.index({ user: 1, category: 1 });
customerSchema.index({ user: 1, tags: 1 });
customerSchema.index({ user: 1, createdAt: -1 });
customerSchema.index({ user: 1, lastActivityAt: -1 });
customerSchema.index({ user: 1, deletedAt: 1 });

// 文本搜索索引
customerSchema.index({
  name: 'text',
  company: 'text',
  email: 'text',
  notes: 'text',
  'contacts.name': 'text',
  'contacts.email': 'text'
});

// 中间件
// 保存前更新时间戳
customerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // 如果是新文档或状态发生变化，更新最后活动时间
  if (this.isNew || this.isModified('status')) {
    this.lastActivityAt = new Date();
  }
  
  // 确保只有一个主要联系人
  if (this.contacts && this.contacts.length > 0) {
    const primaryContacts = this.contacts.filter(contact => contact.isPrimary);
    if (primaryContacts.length > 1) {
      // 只保留第一个作为主要联系人
      this.contacts.forEach((contact, index) => {
        contact.isPrimary = index === 0;
      });
    } else if (primaryContacts.length === 0 && this.contacts.length > 0) {
      // 如果没有主要联系人，设置第一个为主要联系人
      this.contacts[0].isPrimary = true;
    }
  }
  
  next();
});

// 删除前清理关联数据
customerSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  try {
    // 检查是否有关联的项目或合同
    const Project = mongoose.model('Project');
    const Contract = mongoose.model('Contract');
    
    const projectCount = await Project.countDocuments({ customer: this._id });
    const contractCount = await Contract.countDocuments({ customer: this._id });
    
    if (projectCount > 0 || contractCount > 0) {
      const error = new Error('Cannot delete customer with associated projects or contracts');
      error.name = 'ValidationError';
      return next(error);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// 实例方法
// 软删除
customerSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  this.status = 'archived';
  return this.save();
};

// 恢复
customerSchema.methods.restore = function() {
  this.deletedAt = undefined;
  if (this.status === 'archived') {
    this.status = 'active';
  }
  return this.save();
};

// 添加联系人
customerSchema.methods.addContact = function(contactData) {
  // 如果是第一个联系人或指定为主要联系人，设置为主要联系人
  if (this.contacts.length === 0 || contactData.isPrimary) {
    // 清除其他主要联系人标记
    this.contacts.forEach(contact => {
      contact.isPrimary = false;
    });
    contactData.isPrimary = true;
  }
  
  this.contacts.push(contactData);
  return this.save();
};

// 移除联系人
customerSchema.methods.removeContact = function(contactId) {
  const contactIndex = this.contacts.findIndex(contact => contact._id.toString() === contactId);
  
  if (contactIndex === -1) {
    throw new Error('Contact not found');
  }
  
  const removedContact = this.contacts[contactIndex];
  this.contacts.splice(contactIndex, 1);
  
  // 如果删除的是主要联系人，设置第一个联系人为主要联系人
  if (removedContact.isPrimary && this.contacts.length > 0) {
    this.contacts[0].isPrimary = true;
  }
  
  return this.save();
};

// 更新统计信息
customerSchema.methods.updateStats = async function() {
  const Project = mongoose.model('Project');
  const Contract = mongoose.model('Contract');
  const FinancialRecord = mongoose.model('FinancialRecord');
  
  // 项目统计
  const totalProjects = await Project.countDocuments({ customer: this._id });
  const activeProjects = await Project.countDocuments({ 
    customer: this._id, 
    status: { $in: ['planning', 'active'] }
  });
  
  // 合同统计
  const totalContracts = await Contract.countDocuments({ customer: this._id });
  
  // 收入统计
  const revenueResult = await FinancialRecord.aggregate([
    {
      $match: {
        customer: this._id,
        type: 'income'
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' }
      }
    }
  ]);
  
  const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
  
  // 最后项目日期
  const lastProject = await Project.findOne(
    { customer: this._id },
    {},
    { sort: { createdAt: -1 } }
  );
  
  this.stats = {
    totalProjects,
    activeProjects,
    totalContracts,
    totalRevenue,
    lastProjectDate: lastProject ? lastProject.createdAt : null,
    lastContactDate: this.lastActivityAt
  };
  
  return this.save();
};

// 添加标签
customerSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return Promise.resolve(this);
};

// 移除标签
customerSchema.methods.removeTag = function(tag) {
  const index = this.tags.indexOf(tag);
  if (index > -1) {
    this.tags.splice(index, 1);
    return this.save();
  }
  return Promise.resolve(this);
};

// 静态方法
// 按用户查找活跃客户
customerSchema.statics.findActiveByUser = function(userId, options = {}) {
  const query = {
    user: userId,
    status: 'active',
    deletedAt: { $exists: false }
  };
  
  return this.find(query, null, options);
};

// 搜索客户
customerSchema.statics.search = function(userId, searchTerm, options = {}) {
  const query = {
    user: userId,
    deletedAt: { $exists: false },
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { company: { $regex: searchTerm, $options: 'i' } },
      { email: { $regex: searchTerm, $options: 'i' } },
      { 'contacts.name': { $regex: searchTerm, $options: 'i' } },
      { 'contacts.email': { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  return this.find(query, null, options);
};

// 按行业统计
customerSchema.statics.getIndustryStats = function(userId) {
  return this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        deletedAt: { $exists: false }
      }
    },
    {
      $group: {
        _id: '$industry',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$stats.totalRevenue' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

// 获取客户统计
customerSchema.statics.getCustomerStats = function(userId, timeRange = 30) {
  const startDate = new Date(Date.now() - timeRange * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        deletedAt: { $exists: false }
      }
    },
    {
      $facet: {
        total: [
          { $count: 'count' }
        ],
        byStatus: [
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ],
        byPriority: [
          {
            $group: {
              _id: '$priority',
              count: { $sum: 1 }
            }
          }
        ],
        bySource: [
          {
            $group: {
              _id: '$source',
              count: { $sum: 1 }
            }
          }
        ],
        recent: [
          {
            $match: {
              createdAt: { $gte: startDate }
            }
          },
          { $count: 'count' }
        ],
        topRevenue: [
          {
            $sort: { 'stats.totalRevenue': -1 }
          },
          {
            $limit: 10
          },
          {
            $project: {
              name: 1,
              company: 1,
              totalRevenue: '$stats.totalRevenue'
            }
          }
        ]
      }
    }
  ]);
};

module.exports = mongoose.model('Customer', customerSchema);