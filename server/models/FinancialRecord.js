const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * 财务记录数据模型
 * 用于管理收入、支出和财务交易
 */
const financialRecordSchema = new Schema({
  // 基本信息
  title: {
    type: String,
    required: [true, 'Financial record title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
    index: true
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  
  recordNumber: {
    type: String,
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: [50, 'Record number cannot exceed 50 characters'],
    index: true
  },
  
  // 关联信息
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    index: true
  },
  
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    index: true
  },
  
  contract: {
    type: Schema.Types.ObjectId,
    ref: 'Contract',
    index: true
  },
  
  // 财务类型
  type: {
    type: String,
    enum: ['income', 'expense', 'transfer', 'adjustment'],
    required: true,
    index: true
  },
  
  category: {
    type: String,
    required: true,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters'],
    index: true
  },
  
  subcategory: {
    type: String,
    trim: true,
    maxlength: [50, 'Subcategory cannot exceed 50 characters'],
    index: true
  },
  
  // 金额信息
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  
  currency: {
    type: String,
    required: true,
    default: 'USD',
    maxlength: [3, 'Currency code must be 3 characters'],
    index: true
  },
  
  exchangeRate: {
    type: Number,
    min: [0, 'Exchange rate cannot be negative'],
    default: 1
  },
  
  baseAmount: {
    type: Number, // 基础货币金额
    min: [0, 'Base amount cannot be negative']
  },
  
  baseCurrency: {
    type: String,
    default: 'USD',
    maxlength: [3, 'Base currency code must be 3 characters']
  },
  
  // 状态管理
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },
  
  // 时间信息
  transactionDate: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  dueDate: {
    type: Date,
    index: true
  },
  
  paidDate: {
    type: Date,
    index: true
  },
  
  // 付款信息
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'credit_card', 'debit_card', 'paypal', 'stripe', 'check', 'cryptocurrency', 'other'],
    default: 'bank_transfer',
    index: true
  },
  
  paymentDetails: {
    accountNumber: {
      type: String,
      trim: true,
      maxlength: [50, 'Account number cannot exceed 50 characters']
    },
    routingNumber: {
      type: String,
      trim: true,
      maxlength: [20, 'Routing number cannot exceed 20 characters']
    },
    cardLast4: {
      type: String,
      trim: true,
      maxlength: [4, 'Card last 4 digits cannot exceed 4 characters']
    },
    transactionId: {
      type: String,
      trim: true,
      maxlength: [100, 'Transaction ID cannot exceed 100 characters'],
      index: true
    },
    checkNumber: {
      type: String,
      trim: true,
      maxlength: [20, 'Check number cannot exceed 20 characters']
    },
    processorFee: {
      type: Number,
      min: [0, 'Processor fee cannot be negative'],
      default: 0
    }
  },
  
  // 发票信息
  invoice: {
    number: {
      type: String,
      trim: true,
      maxlength: [50, 'Invoice number cannot exceed 50 characters'],
      index: true
    },
    date: {
      type: Date
    },
    dueDate: {
      type: Date
    },
    url: {
      type: String,
      trim: true,
      maxlength: [500, 'Invoice URL cannot exceed 500 characters']
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'],
      default: 'draft'
    }
  },
  
  // 收据信息
  receipt: {
    number: {
      type: String,
      trim: true,
      maxlength: [50, 'Receipt number cannot exceed 50 characters'],
      index: true
    },
    date: {
      type: Date
    },
    url: {
      type: String,
      trim: true,
      maxlength: [500, 'Receipt URL cannot exceed 500 characters']
    },
    vendor: {
      type: String,
      trim: true,
      maxlength: [100, 'Vendor name cannot exceed 100 characters']
    }
  },
  
  // 税务信息
  tax: {
    isTaxable: {
      type: Boolean,
      default: true
    },
    taxRate: {
      type: Number,
      min: [0, 'Tax rate cannot be negative'],
      max: [100, 'Tax rate cannot exceed 100%'],
      default: 0
    },
    taxAmount: {
      type: Number,
      min: [0, 'Tax amount cannot be negative'],
      default: 0
    },
    taxType: {
      type: String,
      enum: ['vat', 'sales_tax', 'income_tax', 'other'],
      default: 'sales_tax'
    },
    taxJurisdiction: {
      type: String,
      trim: true,
      maxlength: [100, 'Tax jurisdiction cannot exceed 100 characters']
    }
  },
  
  // 分期付款
  installments: [{
    number: {
      type: Number,
      required: true,
      min: [1, 'Installment number must be at least 1']
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Installment amount cannot be negative']
    },
    dueDate: {
      type: Date,
      required: true
    },
    paidDate: {
      type: Date
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue', 'cancelled'],
      default: 'pending'
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'credit_card', 'debit_card', 'paypal', 'stripe', 'check', 'other']
    },
    transactionId: {
      type: String,
      trim: true
    }
  }],
  
  // 预算和分配
  budget: {
    allocated: {
      type: Number,
      min: [0, 'Allocated budget cannot be negative'],
      default: 0
    },
    category: {
      type: String,
      trim: true,
      maxlength: [50, 'Budget category cannot exceed 50 characters']
    },
    period: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', 'project'],
      default: 'monthly'
    },
    variance: {
      type: Number // 预算差异
    }
  },
  
  // 审批流程
  approval: {
    required: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'not_required'],
      default: 'not_required'
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    approvedDate: {
      type: Date
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters']
    },
    approvalNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Approval notes cannot exceed 1000 characters']
    }
  },
  
  // 附件和文档
  attachments: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Attachment name cannot exceed 200 characters']
    },
    type: {
      type: String,
      enum: ['invoice', 'receipt', 'contract', 'bank_statement', 'other'],
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
    }
  }],
  
  // 重复交易
  recurring: {
    isRecurring: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly'
    },
    interval: {
      type: Number,
      min: [1, 'Interval must be at least 1'],
      default: 1
    },
    endDate: {
      type: Date
    },
    nextDate: {
      type: Date
    },
    occurrences: {
      type: Number,
      min: [1, 'Occurrences must be at least 1']
    },
    completedOccurrences: {
      type: Number,
      default: 0,
      min: 0
    },
    parentRecord: {
      type: Schema.Types.ObjectId,
      ref: 'FinancialRecord'
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
    maxlength: [2000, 'Notes cannot exceed 2000 characters']
  },
  
  internalNotes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Internal notes cannot exceed 2000 characters']
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
financialRecordSchema.virtual('isOverdue').get(function() {
  return this.dueDate && new Date() > this.dueDate && this.status === 'pending';
});

financialRecordSchema.virtual('daysOverdue').get(function() {
  if (!this.isOverdue) return 0;
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = now - due;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

financialRecordSchema.virtual('netAmount').get(function() {
  return this.amount - (this.tax.taxAmount || 0) - (this.paymentDetails.processorFee || 0);
});

financialRecordSchema.virtual('totalWithTax').get(function() {
  return this.amount + (this.tax.taxAmount || 0);
});

financialRecordSchema.virtual('budgetVariance').get(function() {
  if (!this.budget.allocated || this.budget.allocated === 0) return 0;
  return this.amount - this.budget.allocated;
});

financialRecordSchema.virtual('installmentProgress').get(function() {
  if (!this.installments || this.installments.length === 0) return 100;
  const paidInstallments = this.installments.filter(inst => inst.status === 'paid').length;
  return (paidInstallments / this.installments.length) * 100;
});

// 索引
financialRecordSchema.index({ user: 1, type: 1 });
financialRecordSchema.index({ user: 1, category: 1 });
financialRecordSchema.index({ user: 1, status: 1 });
financialRecordSchema.index({ user: 1, transactionDate: -1 });
financialRecordSchema.index({ user: 1, dueDate: 1 });
financialRecordSchema.index({ user: 1, customer: 1 });
financialRecordSchema.index({ user: 1, project: 1 });
financialRecordSchema.index({ user: 1, contract: 1 });
financialRecordSchema.index({ user: 1, currency: 1 });
financialRecordSchema.index({ user: 1, paymentMethod: 1 });
financialRecordSchema.index({ user: 1, createdAt: -1 });
financialRecordSchema.index({ user: 1, deletedAt: 1 });
financialRecordSchema.index({ recordNumber: 1 }, { unique: true });
financialRecordSchema.index({ 'invoice.number': 1 });
financialRecordSchema.index({ 'receipt.number': 1 });
financialRecordSchema.index({ 'paymentDetails.transactionId': 1 });
financialRecordSchema.index({ 'recurring.nextDate': 1 });
financialRecordSchema.index({ 'approval.status': 1 });

// 文本搜索索引
financialRecordSchema.index({
  title: 'text',
  description: 'text',
  recordNumber: 'text',
  notes: 'text',
  'invoice.number': 'text',
  'receipt.number': 'text'
});

// 中间件
// 保存前生成记录编号
financialRecordSchema.pre('save', async function(next) {
  if (this.isNew && !this.recordNumber) {
    // 生成记录编号：根据类型 + 年份 + 月份 + 随机数
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    
    const typePrefix = {
      'income': 'INC',
      'expense': 'EXP',
      'transfer': 'TRF',
      'adjustment': 'ADJ'
    };
    
    let recordNumber = `${typePrefix[this.type]}${year}${month}${random}`;
    
    // 确保记录编号唯一
    let counter = 1;
    while (await this.constructor.findOne({ recordNumber })) {
      recordNumber = `${typePrefix[this.type]}${year}${month}${random}${counter.toString().padStart(2, '0')}`;
      counter++;
    }
    
    this.recordNumber = recordNumber;
  }
  
  // 更新时间戳
  this.updatedAt = new Date();
  
  // 计算基础货币金额
  if (this.isModified('amount') || this.isModified('exchangeRate')) {
    this.baseAmount = this.amount * this.exchangeRate;
  }
  
  // 计算税额
  if (this.tax.isTaxable && this.tax.taxRate > 0) {
    this.tax.taxAmount = (this.amount * this.tax.taxRate) / 100;
  } else {
    this.tax.taxAmount = 0;
  }
  
  // 计算预算差异
  if (this.budget.allocated) {
    this.budget.variance = this.amount - this.budget.allocated;
  }
  
  // 设置下次重复日期
  if (this.recurring.isRecurring && !this.recurring.nextDate) {
    this.recurring.nextDate = this.calculateNextRecurringDate();
  }
  
  next();
});

// 实例方法
// 软删除
financialRecordSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  this.status = 'cancelled';
  return this.save();
};

// 恢复
financialRecordSchema.methods.restore = function() {
  this.deletedAt = undefined;
  if (this.status === 'cancelled') {
    this.status = 'pending';
  }
  return this.save();
};

// 确认交易
financialRecordSchema.methods.confirm = function(paidDate = new Date()) {
  this.status = 'confirmed';
  this.paidDate = paidDate;
  return this.save();
};

// 取消交易
financialRecordSchema.methods.cancel = function(reason = null) {
  this.status = 'cancelled';
  
  if (reason) {
    this.notes = (this.notes || '') + `\n\nCancelled: ${reason}`;
  }
  
  return this.save();
};

// 添加分期付款
financialRecordSchema.methods.addInstallment = function(number, amount, dueDate) {
  this.installments.push({
    number,
    amount,
    dueDate,
    status: 'pending'
  });
  
  return this.save();
};

// 支付分期
financialRecordSchema.methods.payInstallment = function(installmentId, paymentMethod = null, transactionId = null) {
  const installment = this.installments.id(installmentId);
  
  if (!installment) {
    throw new Error('Installment not found');
  }
  
  installment.status = 'paid';
  installment.paidDate = new Date();
  
  if (paymentMethod) {
    installment.paymentMethod = paymentMethod;
  }
  
  if (transactionId) {
    installment.transactionId = transactionId;
  }
  
  // 检查是否所有分期都已支付
  const allPaid = this.installments.every(inst => inst.status === 'paid');
  if (allPaid) {
    this.status = 'confirmed';
    this.paidDate = new Date();
  }
  
  return this.save();
};

// 申请审批
financialRecordSchema.methods.requestApproval = function() {
  this.approval.required = true;
  this.approval.status = 'pending';
  return this.save();
};

// 审批
financialRecordSchema.methods.approve = function(approvedBy, notes = null) {
  this.approval.status = 'approved';
  this.approval.approvedBy = approvedBy;
  this.approval.approvedDate = new Date();
  
  if (notes) {
    this.approval.approvalNotes = notes;
  }
  
  return this.save();
};

// 拒绝审批
financialRecordSchema.methods.reject = function(rejectionReason) {
  this.approval.status = 'rejected';
  this.approval.rejectionReason = rejectionReason;
  return this.save();
};

// 计算下次重复日期
financialRecordSchema.methods.calculateNextRecurringDate = function() {
  if (!this.recurring.isRecurring) return null;
  
  const baseDate = this.recurring.nextDate || this.transactionDate;
  const nextDate = new Date(baseDate);
  
  switch (this.recurring.frequency) {
  case 'daily':
    nextDate.setDate(nextDate.getDate() + this.recurring.interval);
    break;
  case 'weekly':
    nextDate.setDate(nextDate.getDate() + (this.recurring.interval * 7));
    break;
  case 'monthly':
    nextDate.setMonth(nextDate.getMonth() + this.recurring.interval);
    break;
  case 'quarterly':
    nextDate.setMonth(nextDate.getMonth() + (this.recurring.interval * 3));
    break;
  case 'yearly':
    nextDate.setFullYear(nextDate.getFullYear() + this.recurring.interval);
    break;
  }
  
  return nextDate;
};

// 创建重复记录
financialRecordSchema.methods.createRecurringRecord = function() {
  if (!this.recurring.isRecurring || !this.recurring.nextDate) {
    throw new Error('This is not a recurring record or next date is not set');
  }
  
  // 检查是否已达到最大重复次数
  if (this.recurring.occurrences && 
      this.recurring.completedOccurrences >= this.recurring.occurrences) {
    return null;
  }
  
  // 检查是否已过结束日期
  if (this.recurring.endDate && new Date() > this.recurring.endDate) {
    return null;
  }
  
  const newRecord = new this.constructor({
    ...this.toObject(),
    _id: undefined,
    recordNumber: undefined,
    transactionDate: this.recurring.nextDate,
    dueDate: this.recurring.nextDate,
    status: 'pending',
    paidDate: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    'recurring.parentRecord': this._id,
    'recurring.completedOccurrences': 0
  });
  
  // 更新当前记录
  this.recurring.completedOccurrences += 1;
  this.recurring.nextDate = this.calculateNextRecurringDate();
  
  return newRecord;
};

// 静态方法
// 按用户查找记录
financialRecordSchema.statics.findByUser = function(userId, options = {}) {
  const query = {
    user: userId,
    deletedAt: { $exists: false }
  };
  
  return this.find(query, null, options);
};

// 搜索记录
financialRecordSchema.statics.search = function(userId, searchTerm, options = {}) {
  const query = {
    user: userId,
    deletedAt: { $exists: false },
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { recordNumber: { $regex: searchTerm, $options: 'i' } },
      { 'invoice.number': { $regex: searchTerm, $options: 'i' } },
      { 'receipt.number': { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  return this.find(query, null, options);
};

// 获取逾期记录
financialRecordSchema.statics.getOverdueRecords = function(userId) {
  return this.find({
    user: userId,
    dueDate: { $lt: new Date() },
    status: 'pending',
    deletedAt: { $exists: false }
  }).populate('customer', 'name company').sort({ dueDate: 1 });
};

// 获取财务统计
financialRecordSchema.statics.getFinancialStats = function(userId, startDate, endDate) {
  const matchQuery = {
    user: mongoose.Types.ObjectId(userId),
    transactionDate: {
      $gte: startDate,
      $lte: endDate
    },
    status: 'confirmed',
    deletedAt: { $exists: false }
  };
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $facet: {
        income: [
          { $match: { type: 'income' } },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
              count: { $sum: 1 },
              avgAmount: { $avg: '$amount' }
            }
          }
        ],
        expenses: [
          { $match: { type: 'expense' } },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' },
              count: { $sum: 1 },
              avgAmount: { $avg: '$amount' }
            }
          }
        ],
        byCategory: [
          {
            $group: {
              _id: { type: '$type', category: '$category' },
              total: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          { $sort: { total: -1 } }
        ],
        byMonth: [
          {
            $group: {
              _id: {
                year: { $year: '$transactionDate' },
                month: { $month: '$transactionDate' },
                type: '$type'
              },
              total: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.year': 1, '_id.month': 1 } }
        ],
        byCurrency: [
          {
            $group: {
              _id: '$currency',
              total: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ]);
};

// 获取现金流
financialRecordSchema.statics.getCashFlow = function(userId, startDate, endDate, groupBy = 'month') {
  const matchQuery = {
    user: mongoose.Types.ObjectId(userId),
    transactionDate: {
      $gte: startDate,
      $lte: endDate
    },
    status: 'confirmed',
    deletedAt: { $exists: false }
  };
  
  let groupId;
  switch (groupBy) {
  case 'day':
    groupId = {
      year: { $year: '$transactionDate' },
      month: { $month: '$transactionDate' },
      day: { $dayOfMonth: '$transactionDate' }
    };
    break;
  case 'week':
    groupId = {
      year: { $year: '$transactionDate' },
      week: { $week: '$transactionDate' }
    };
    break;
  case 'month':
    groupId = {
      year: { $year: '$transactionDate' },
      month: { $month: '$transactionDate' }
    };
    break;
  case 'quarter':
    groupId = {
      year: { $year: '$transactionDate' },
      quarter: {
        $ceil: { $divide: [{ $month: '$transactionDate' }, 3] }
      }
    };
    break;
  case 'year':
    groupId = {
      year: { $year: '$transactionDate' }
    };
    break;
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          ...groupId,
          type: '$type'
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: {
          year: '$_id.year',
          month: '$_id.month',
          day: '$_id.day',
          week: '$_id.week',
          quarter: '$_id.quarter'
        },
        income: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'income'] }, '$total', 0]
          }
        },
        expenses: {
          $sum: {
            $cond: [{ $eq: ['$_id.type', 'expense'] }, '$total', 0]
          }
        },
        netFlow: {
          $sum: {
            $cond: [
              { $eq: ['$_id.type', 'income'] },
              '$total',
              { $multiply: ['$total', -1] }
            ]
          }
        }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);
};

// 获取待处理的重复记录
financialRecordSchema.statics.getPendingRecurringRecords = function() {
  return this.find({
    'recurring.isRecurring': true,
    'recurring.nextDate': { $lte: new Date() },
    deletedAt: { $exists: false }
  });
};

module.exports = mongoose.model('FinancialRecord', financialRecordSchema);