const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * 合同数据模型
 * 用于管理合同信息和条款
 */
const contractSchema = new Schema({
  // 基本信息
  title: {
    type: String,
    required: [true, 'Contract title is required'],
    trim: true,
    maxlength: [200, 'Contract title cannot exceed 200 characters'],
    index: true
  },
  
  contractNumber: {
    type: String,
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: [50, 'Contract number cannot exceed 50 characters'],
    index: true
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Contract description cannot exceed 2000 characters']
  },
  
  // 关联信息
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer is required'],
    index: true
  },
  
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // 合同类型
  type: {
    type: String,
    enum: ['service', 'product', 'maintenance', 'consulting', 'license', 'partnership', 'nda', 'other'],
    default: 'service',
    index: true
  },
  
  category: {
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters'],
    index: true
  },
  
  // 合同状态
  status: {
    type: String,
    enum: ['draft', 'review', 'pending_signature', 'active', 'completed', 'terminated', 'expired', 'cancelled'],
    default: 'draft',
    index: true
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  
  // 时间管理
  startDate: {
    type: Date,
    index: true
  },
  
  endDate: {
    type: Date,
    index: true
  },
  
  signedDate: {
    type: Date,
    index: true
  },
  
  effectiveDate: {
    type: Date,
    index: true
  },
  
  expirationDate: {
    type: Date,
    index: true
  },
  
  // 续约信息
  renewal: {
    isAutoRenewal: {
      type: Boolean,
      default: false
    },
    renewalPeriod: {
      type: Number, // 续约期限（月）
      min: [1, 'Renewal period must be at least 1 month']
    },
    renewalNotice: {
      type: Number, // 续约通知期（天）
      min: [1, 'Renewal notice period must be at least 1 day'],
      default: 30
    },
    lastRenewalDate: {
      type: Date
    },
    renewalCount: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // 财务条款
  financial: {
    totalValue: {
      type: Number,
      required: [true, 'Total contract value is required'],
      min: [0, 'Total value cannot be negative']
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
      maxlength: [3, 'Currency code must be 3 characters']
    },
    paymentTerms: {
      type: String,
      enum: ['net_15', 'net_30', 'net_45', 'net_60', 'due_on_receipt', 'milestone_based', 'monthly', 'quarterly', 'annually', 'custom'],
      default: 'net_30'
    },
    paymentSchedule: [{
      description: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Payment description cannot exceed 200 characters']
      },
      amount: {
        type: Number,
        required: true,
        min: [0, 'Payment amount cannot be negative']
      },
      dueDate: {
        type: Date,
        required: true
      },
      status: {
        type: String,
        enum: ['pending', 'paid', 'overdue', 'cancelled'],
        default: 'pending'
      },
      paidDate: {
        type: Date
      },
      paidAmount: {
        type: Number,
        min: [0, 'Paid amount cannot be negative'],
        default: 0
      },
      invoiceNumber: {
        type: String,
        trim: true
      }
    }],
    discounts: [{
      type: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
      },
      value: {
        type: Number,
        required: true,
        min: [0, 'Discount value cannot be negative']
      },
      description: {
        type: String,
        trim: true,
        maxlength: [200, 'Discount description cannot exceed 200 characters']
      },
      conditions: {
        type: String,
        trim: true,
        maxlength: [500, 'Discount conditions cannot exceed 500 characters']
      }
    }],
    penalties: [{
      type: {
        type: String,
        enum: ['late_payment', 'breach', 'termination', 'other'],
        required: true
      },
      amount: {
        type: Number,
        min: [0, 'Penalty amount cannot be negative']
      },
      percentage: {
        type: Number,
        min: [0, 'Penalty percentage cannot be negative'],
        max: [100, 'Penalty percentage cannot exceed 100']
      },
      description: {
        type: String,
        required: true,
        trim: true,
        maxlength: [500, 'Penalty description cannot exceed 500 characters']
      }
    }]
  },
  
  // 交付物
  deliverables: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Deliverable name cannot exceed 200 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Deliverable description cannot exceed 1000 characters']
    },
    dueDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'delivered', 'accepted', 'rejected'],
      default: 'pending'
    },
    deliveredDate: {
      type: Date
    },
    acceptedDate: {
      type: Date
    },
    specifications: {
      type: String,
      trim: true,
      maxlength: [2000, 'Specifications cannot exceed 2000 characters']
    },
    acceptanceCriteria: {
      type: String,
      trim: true,
      maxlength: [1000, 'Acceptance criteria cannot exceed 1000 characters']
    },
    attachments: [{
      name: {
        type: String,
        required: true,
        trim: true
      },
      url: {
        type: String,
        required: true,
        trim: true
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  }],
  
  // 服务水平协议 (SLA)
  sla: {
    responseTime: {
      type: Number, // 响应时间（小时）
      min: [0, 'Response time cannot be negative']
    },
    resolutionTime: {
      type: Number, // 解决时间（小时）
      min: [0, 'Resolution time cannot be negative']
    },
    availability: {
      type: Number, // 可用性百分比
      min: [0, 'Availability cannot be less than 0%'],
      max: [100, 'Availability cannot exceed 100%']
    },
    supportHours: {
      type: String,
      enum: ['24x7', 'business_hours', 'extended_hours', 'custom'],
      default: 'business_hours'
    },
    customSupportHours: {
      type: String,
      trim: true,
      maxlength: [200, 'Custom support hours cannot exceed 200 characters']
    },
    penalties: [{
      metric: {
        type: String,
        enum: ['response_time', 'resolution_time', 'availability'],
        required: true
      },
      threshold: {
        type: Number,
        required: true
      },
      penalty: {
        type: String,
        required: true,
        trim: true,
        maxlength: [500, 'SLA penalty cannot exceed 500 characters']
      }
    }]
  },
  
  // 条款和条件
  terms: {
    confidentiality: {
      type: String,
      trim: true,
      maxlength: [2000, 'Confidentiality terms cannot exceed 2000 characters']
    },
    intellectualProperty: {
      type: String,
      trim: true,
      maxlength: [2000, 'IP terms cannot exceed 2000 characters']
    },
    liability: {
      type: String,
      trim: true,
      maxlength: [2000, 'Liability terms cannot exceed 2000 characters']
    },
    termination: {
      type: String,
      trim: true,
      maxlength: [2000, 'Termination terms cannot exceed 2000 characters']
    },
    disputeResolution: {
      type: String,
      trim: true,
      maxlength: [1000, 'Dispute resolution terms cannot exceed 1000 characters']
    },
    governingLaw: {
      type: String,
      trim: true,
      maxlength: [200, 'Governing law cannot exceed 200 characters']
    },
    forcemajeure: {
      type: String,
      trim: true,
      maxlength: [1000, 'Force majeure terms cannot exceed 1000 characters']
    },
    customTerms: [{
      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: [100, 'Custom term title cannot exceed 100 characters']
      },
      content: {
        type: String,
        required: true,
        trim: true,
        maxlength: [2000, 'Custom term content cannot exceed 2000 characters']
      }
    }]
  },
  
  // 签署信息
  signatures: [{
    party: {
      type: String,
      enum: ['client', 'provider', 'witness'],
      required: true
    },
    signerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Signer name cannot exceed 100 characters']
    },
    signerTitle: {
      type: String,
      trim: true,
      maxlength: [100, 'Signer title cannot exceed 100 characters']
    },
    signerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
    },
    signedDate: {
      type: Date
    },
    signatureMethod: {
      type: String,
      enum: ['electronic', 'physical', 'digital'],
      default: 'electronic'
    },
    signatureData: {
      type: String, // Base64 encoded signature or signature ID
      trim: true
    },
    ipAddress: {
      type: String,
      trim: true
    },
    location: {
      type: String,
      trim: true,
      maxlength: [200, 'Signature location cannot exceed 200 characters']
    },
    isSigned: {
      type: Boolean,
      default: false
    }
  }],
  
  // 修订历史
  revisions: [{
    version: {
      type: String,
      required: true,
      trim: true,
      maxlength: [20, 'Version cannot exceed 20 characters']
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, 'Revision description cannot exceed 500 characters']
    },
    revisedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    revisedDate: {
      type: Date,
      default: Date.now
    },
    changes: [{
      field: {
        type: String,
        required: true,
        trim: true
      },
      oldValue: {
        type: String,
        trim: true
      },
      newValue: {
        type: String,
        trim: true
      },
      reason: {
        type: String,
        trim: true,
        maxlength: [500, 'Change reason cannot exceed 500 characters']
      }
    }]
  }],
  
  // 文档和附件
  documents: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Document name cannot exceed 200 characters']
    },
    type: {
      type: String,
      enum: ['contract', 'amendment', 'addendum', 'exhibit', 'schedule', 'other'],
      default: 'other'
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    size: {
      type: Number,
      min: [0, 'File size cannot be negative']
    },
    mimeType: {
      type: String,
      trim: true
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    version: {
      type: String,
      default: '1.0'
    },
    isExecuted: {
      type: Boolean,
      default: false
    }
  }],
  
  // 通知和提醒
  notifications: {
    renewalReminder: {
      enabled: {
        type: Boolean,
        default: true
      },
      daysBefore: {
        type: Number,
        default: 30,
        min: [1, 'Renewal reminder must be at least 1 day before']
      }
    },
    expirationReminder: {
      enabled: {
        type: Boolean,
        default: true
      },
      daysBefore: {
        type: Number,
        default: 30,
        min: [1, 'Expiration reminder must be at least 1 day before']
      }
    },
    paymentReminder: {
      enabled: {
        type: Boolean,
        default: true
      },
      daysBefore: {
        type: Number,
        default: 7,
        min: [1, 'Payment reminder must be at least 1 day before']
      }
    }
  },
  
  // 标签和分类
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  
  // 备注
  notes: {
    type: String,
    trim: true,
    maxlength: [5000, 'Notes cannot exceed 5000 characters']
  },
  
  internalNotes: {
    type: String,
    trim: true,
    maxlength: [5000, 'Internal notes cannot exceed 5000 characters']
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
contractSchema.virtual('isActive').get(function() {
  return this.status === 'active' && !this.deletedAt;
});

contractSchema.virtual('isExpired').get(function() {
  return this.expirationDate && new Date() > this.expirationDate;
});

contractSchema.virtual('daysUntilExpiration').get(function() {
  if (!this.expirationDate) return null;
  const now = new Date();
  const expiration = new Date(this.expirationDate);
  const diffTime = expiration - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

contractSchema.virtual('totalPaid').get(function() {
  return this.financial.paymentSchedule.reduce((sum, payment) => {
    return sum + (payment.paidAmount || 0);
  }, 0);
});

contractSchema.virtual('remainingAmount').get(function() {
  return this.financial.totalValue - this.totalPaid;
});

contractSchema.virtual('paymentProgress').get(function() {
  if (!this.financial.totalValue || this.financial.totalValue === 0) return 0;
  return (this.totalPaid / this.financial.totalValue) * 100;
});

contractSchema.virtual('isFullySigned').get(function() {
  return this.signatures.length > 0 && this.signatures.every(sig => sig.isSigned);
});

// 索引
contractSchema.index({ user: 1, title: 1 });
contractSchema.index({ user: 1, customer: 1 });
contractSchema.index({ user: 1, project: 1 });
contractSchema.index({ user: 1, status: 1 });
contractSchema.index({ user: 1, type: 1 });
contractSchema.index({ user: 1, priority: 1 });
contractSchema.index({ user: 1, startDate: 1 });
contractSchema.index({ user: 1, endDate: 1 });
contractSchema.index({ user: 1, expirationDate: 1 });
contractSchema.index({ user: 1, createdAt: -1 });
contractSchema.index({ user: 1, lastActivityAt: -1 });
contractSchema.index({ user: 1, deletedAt: 1 });
contractSchema.index({ contractNumber: 1 }, { unique: true });
contractSchema.index({ 'financial.paymentSchedule.dueDate': 1 });
contractSchema.index({ 'signatures.isSigned': 1 });

// 文本搜索索引
contractSchema.index({
  title: 'text',
  description: 'text',
  contractNumber: 'text',
  notes: 'text'
});

// 中间件
// 保存前生成合同编号
contractSchema.pre('save', async function(next) {
  if (this.isNew && !this.contractNumber) {
    // 生成合同编号：CON + 年份 + 月份 + 随机数
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    let contractNumber = `CON${year}${month}${random}`;
    
    // 确保合同编号唯一
    let counter = 1;
    while (await this.constructor.findOne({ contractNumber })) {
      contractNumber = `CON${year}${month}${random}${counter.toString().padStart(2, '0')}`;
      counter++;
    }
    
    this.contractNumber = contractNumber;
  }
  
  // 更新时间戳
  this.updatedAt = new Date();
  
  // 如果状态发生变化，更新最后活动时间
  if (this.isModified('status')) {
    this.lastActivityAt = new Date();
    
    // 如果合同被签署，设置签署日期
    if (this.status === 'active' && !this.signedDate) {
      this.signedDate = new Date();
    }
  }
  
  // 检查所有签名是否完成
  if (this.signatures.length > 0 && this.signatures.every(sig => sig.isSigned)) {
    if (this.status === 'pending_signature') {
      this.status = 'active';
      this.signedDate = new Date();
      this.effectiveDate = this.effectiveDate || new Date();
    }
  }
  
  next();
});

// 实例方法
// 软删除
contractSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  this.status = 'cancelled';
  return this.save();
};

// 恢复
contractSchema.methods.restore = function() {
  this.deletedAt = undefined;
  if (this.status === 'cancelled') {
    this.status = 'draft';
  }
  return this.save();
};

// 添加签名
contractSchema.methods.addSignature = function(signatureData) {
  this.signatures.push({
    ...signatureData,
    signedDate: new Date(),
    isSigned: true
  });
  
  return this.save();
};

// 添加付款记录
contractSchema.methods.recordPayment = function(paymentId, amount, paidDate = new Date(), invoiceNumber = null) {
  const payment = this.financial.paymentSchedule.id(paymentId);
  
  if (!payment) {
    throw new Error('Payment not found');
  }
  
  payment.paidAmount = amount;
  payment.paidDate = paidDate;
  payment.invoiceNumber = invoiceNumber;
  
  if (amount >= payment.amount) {
    payment.status = 'paid';
  }
  
  return this.save();
};

// 添加交付物
contractSchema.methods.addDeliverable = function(deliverableData) {
  this.deliverables.push({
    ...deliverableData,
    status: 'pending'
  });
  
  return this.save();
};

// 更新交付物状态
contractSchema.methods.updateDeliverableStatus = function(deliverableId, status, date = new Date()) {
  const deliverable = this.deliverables.id(deliverableId);
  
  if (!deliverable) {
    throw new Error('Deliverable not found');
  }
  
  deliverable.status = status;
  
  if (status === 'delivered') {
    deliverable.deliveredDate = date;
  } else if (status === 'accepted') {
    deliverable.acceptedDate = date;
  }
  
  return this.save();
};

// 添加修订
contractSchema.methods.addRevision = function(version, description, changes, revisedBy) {
  this.revisions.push({
    version,
    description,
    changes,
    revisedBy,
    revisedDate: new Date()
  });
  
  return this.save();
};

// 续约
contractSchema.methods.renew = function(newEndDate, newTotalValue = null) {
  this.endDate = newEndDate;
  this.expirationDate = newEndDate;
  
  if (newTotalValue) {
    this.financial.totalValue = newTotalValue;
  }
  
  this.renewal.lastRenewalDate = new Date();
  this.renewal.renewalCount += 1;
  
  this.status = 'active';
  
  return this.save();
};

// 终止合同
contractSchema.methods.terminate = function(reason = null, terminationDate = new Date()) {
  this.status = 'terminated';
  this.endDate = terminationDate;
  
  if (reason) {
    this.notes = (this.notes || '') + `\n\nTerminated on ${terminationDate.toISOString()}: ${reason}`;
  }
  
  return this.save();
};

// 静态方法
// 按用户查找活跃合同
contractSchema.statics.findActiveByUser = function(userId, options = {}) {
  const query = {
    user: userId,
    status: 'active',
    deletedAt: { $exists: false }
  };
  
  return this.find(query, null, options);
};

// 搜索合同
contractSchema.statics.search = function(userId, searchTerm, options = {}) {
  const query = {
    user: userId,
    deletedAt: { $exists: false },
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { contractNumber: { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  return this.find(query, null, options);
};

// 获取即将到期的合同
contractSchema.statics.getExpiringContracts = function(userId, days = 30) {
  const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  
  return this.find({
    user: userId,
    expirationDate: {
      $gte: new Date(),
      $lte: endDate
    },
    status: 'active',
    deletedAt: { $exists: false }
  }).populate('customer', 'name company').sort({ expirationDate: 1 });
};

// 获取逾期付款
contractSchema.statics.getOverduePayments = function(userId) {
  return this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        status: 'active',
        deletedAt: { $exists: false }
      }
    },
    {
      $unwind: '$financial.paymentSchedule'
    },
    {
      $match: {
        'financial.paymentSchedule.dueDate': { $lt: new Date() },
        'financial.paymentSchedule.status': { $ne: 'paid' }
      }
    },
    {
      $lookup: {
        from: 'customers',
        localField: 'customer',
        foreignField: '_id',
        as: 'customerInfo'
      }
    },
    {
      $project: {
        title: 1,
        contractNumber: 1,
        customer: { $arrayElemAt: ['$customerInfo', 0] },
        payment: '$financial.paymentSchedule',
        daysOverdue: {
          $divide: [
            { $subtract: [new Date(), '$financial.paymentSchedule.dueDate'] },
            1000 * 60 * 60 * 24
          ]
        }
      }
    },
    {
      $sort: { 'payment.dueDate': 1 }
    }
  ]);
};

// 获取合同统计
contractSchema.statics.getContractStats = function(userId, timeRange = 30) {
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
        byType: [
          {
            $group: {
              _id: '$type',
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
        expiringSoon: [
          {
            $match: {
              expirationDate: {
                $gte: new Date(),
                $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              },
              status: 'active'
            }
          },
          { $count: 'count' }
        ],
        financialStats: [
          {
            $group: {
              _id: null,
              totalValue: { $sum: '$financial.totalValue' },
              avgValue: { $avg: '$financial.totalValue' }
            }
          }
        ]
      }
    }
  ]);
};

module.exports = mongoose.model('Contract', contractSchema);