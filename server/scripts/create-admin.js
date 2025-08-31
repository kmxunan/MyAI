const mongoose = require('mongoose');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

// 连接数据库
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/myai', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

// 创建管理员账号
const createAdmin = async () => {
  try {
    // 检查是否已存在管理员账号
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('管理员账号已存在:', existingAdmin.email);
      return;
    }

    // 管理员账号信息
    const adminData = {
      username: 'admin',
      email: 'admin@myai.com',
      password: 'Admin123!@#', // 强密码
      firstName: 'System',
      lastName: 'Administrator',
      role: 'admin',
      roles: ['admin', 'user'],
      permissions: [
        'chat:read', 'chat:write', 'chat:delete',
        'biz:customers:read', 'biz:customers:write', 'biz:customers:delete',
        'biz:projects:read', 'biz:projects:write', 'biz:projects:delete',
        'biz:contracts:read', 'biz:contracts:write', 'biz:contracts:delete',
        'biz:finance:read', 'biz:finance:write', 'biz:finance:delete',
        'rag:read', 'rag:write', 'rag:delete',
        'admin:users', 'admin:system', 'admin:logs'
      ],
      isActive: true,
      isEmailVerified: true,
      subscription: {
        plan: 'enterprise',
        status: 'active',
        tokenLimit: 1000000,
        requestLimit: 10000
      },
      apiKey: uuidv4()
    };

    // 创建管理员用户
    const admin = new User(adminData);
    await admin.save();

    console.log('✅ 管理员账号创建成功!');
    console.log('📧 邮箱:', admin.email);
    console.log('👤 用户名:', admin.username);
    console.log('🔑 密码:', 'Admin123!@#');
    console.log('🔐 API Key:', admin.apiKey);
    console.log('\n⚠️  请立即登录并修改默认密码!');
    
  } catch (error) {
    console.error('创建管理员账号失败:', error);
  }
};

// 主函数
const main = async () => {
  await connectDB();
  await createAdmin();
  await mongoose.connection.close();
  console.log('\n数据库连接已关闭');
  process.exit(0);
};

// 执行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = { createAdmin };