// MongoDB 初始化脚本
// 用于创建 MyAI 数据库和初始用户

// 切换到 myai 数据库
db = db.getSiblingDB('myai');

// 创建管理员用户
db.createUser({
  user: 'myai_admin',
  pwd: 'myai_password_2024',
  roles: [
    {
      role: 'readWrite',
      db: 'myai'
    },
    {
      role: 'dbAdmin',
      db: 'myai'
    }
  ]
});

// 创建应用用户
db.createUser({
  user: 'myai_app',
  pwd: 'myai_app_password_2024',
  roles: [
    {
      role: 'readWrite',
      db: 'myai'
    }
  ]
});

// 创建基础集合
db.createCollection('users');
db.createCollection('conversations');
db.createCollection('messages');
db.createCollection('customers');
db.createCollection('projects');
db.createCollection('contracts');
db.createCollection('financialrecords');

// 创建索引
// 用户集合索引
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ apiKey: 1 }, { unique: true, sparse: true });
db.users.createIndex({ createdAt: 1 });

// 对话集合索引
db.conversations.createIndex({ userId: 1 });
db.conversations.createIndex({ createdAt: -1 });
db.conversations.createIndex({ updatedAt: -1 });
db.conversations.createIndex({ 'sharing.shareId': 1 }, { unique: true, sparse: true });

// 消息集合索引
db.messages.createIndex({ conversationId: 1 });
db.messages.createIndex({ userId: 1 });
db.messages.createIndex({ createdAt: -1 });
db.messages.createIndex({ messageId: 1 }, { unique: true });

// 客户集合索引
db.customers.createIndex({ userId: 1 });
db.customers.createIndex({ email: 1 });
db.customers.createIndex({ phone: 1 });
db.customers.createIndex({ createdAt: -1 });

// 项目集合索引
db.projects.createIndex({ userId: 1 });
db.projects.createIndex({ customerId: 1 });
db.projects.createIndex({ projectCode: 1 }, { unique: true });
db.projects.createIndex({ status: 1 });
db.projects.createIndex({ createdAt: -1 });

// 合同集合索引
db.contracts.createIndex({ userId: 1 });
db.contracts.createIndex({ projectId: 1 });
db.contracts.createIndex({ customerId: 1 });
db.contracts.createIndex({ contractNumber: 1 }, { unique: true });
db.contracts.createIndex({ status: 1 });
db.contracts.createIndex({ createdAt: -1 });

// 财务记录集合索引
db.financialrecords.createIndex({ userId: 1 });
db.financialrecords.createIndex({ projectId: 1 });
db.financialrecords.createIndex({ customerId: 1 });
db.financialrecords.createIndex({ type: 1 });
db.financialrecords.createIndex({ recordNumber: 1 }, { unique: true });
db.financialrecords.createIndex({ 'invoice.number': 1 }, { unique: true, sparse: true });
db.financialrecords.createIndex({ 'receipt.number': 1 }, { unique: true, sparse: true });
db.financialrecords.createIndex({ 'paymentDetails.transactionId': 1 }, { unique: true, sparse: true });
db.financialrecords.createIndex({ createdAt: -1 });

// 插入默认管理员用户
db.users.insertOne({
  username: 'admin',
  email: 'admin@myai.com',
  password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq5S/kS', // password: admin123
  role: 'admin',
  permissions: ['all'],
  profile: {
    firstName: '系统',
    lastName: '管理员',
    avatar: null,
    bio: 'MyAI 系统管理员账户'
  },
  preferences: {
    language: 'zh-CN',
    theme: 'light',
    notifications: {
      email: true,
      push: true,
      sms: false
    }
  },
  isActive: true,
  isEmailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date()
});

// 插入示例客户数据
db.customers.insertMany([
  {
    name: '示例科技有限公司',
    email: 'contact@example-tech.com',
    phone: '+86-138-0000-0001',
    address: {
      street: '科技园区创新大道123号',
      city: '深圳',
      province: '广东',
      country: '中国',
      zipCode: '518000'
    },
    contactPerson: {
      name: '张经理',
      title: '技术总监',
      email: 'zhang@example-tech.com',
      phone: '+86-138-0000-0002'
    },
    industry: '软件开发',
    companySize: '50-200人',
    website: 'https://www.example-tech.com',
    notes: '重要客户，专注于AI技术开发',
    tags: ['重要客户', 'AI技术', '长期合作'],
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: '创新教育集团',
    email: 'info@innovation-edu.com',
    phone: '+86-138-0000-0003',
    address: {
      street: '教育路88号',
      city: '北京',
      province: '北京',
      country: '中国',
      zipCode: '100000'
    },
    contactPerson: {
      name: '李主任',
      title: '信息化主任',
      email: 'li@innovation-edu.com',
      phone: '+86-138-0000-0004'
    },
    industry: '教育培训',
    companySize: '200-500人',
    website: 'https://www.innovation-edu.com',
    notes: '教育行业客户，关注AI在教育中的应用',
    tags: ['教育行业', 'AI应用', '潜在客户'],
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print('MyAI 数据库初始化完成！');
print('创建的用户：');
print('- 管理员: admin / admin123');
print('- 数据库用户: myai_admin / myai_password_2024');
print('- 应用用户: myai_app / myai_app_password_2024');
print('已创建基础集合和索引');
print('已插入示例数据');