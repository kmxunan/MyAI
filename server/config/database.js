const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { config, getDatabaseUri } = require('./index');

/**
 * 连接 MongoDB 数据库
 */
const connectDB = async () => {
  try {
    const mongoURI = getDatabaseUri();
    logger.info('Attempting to connect to MongoDB:', mongoURI);
    
    const options = {
      ...config.database.mongodb.options,
      bufferCommands: false, // 禁用 mongoose 缓冲命令
    };

    logger.info('Connecting with options:', options);
    // 连接数据库
    const conn = await mongoose.connect(mongoURI, options);
    logger.info('MongoDB connection established');
    
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    
    // 监听连接事件
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose connected to MongoDB');
    });
    
    mongoose.connection.on('error', (err) => {
      logger.error('Mongoose connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB');
    });
    
    // 应用终止时关闭数据库连接
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('Mongoose connection closed through app termination');
      process.exit(0);
    });
    
    return conn;
  } catch (error) {
    logger.error('Database connection failed:', error.message);
    throw error;
  }
};

/**
 * 创建数据库索引
 */
const createIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    
    // 用户集合索引
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('users').createIndex({ createdAt: 1 });
    
    // 对话集合索引
    await db.collection('conversations').createIndex({ userId: 1 });
    await db.collection('conversations').createIndex({ createdAt: -1 });
    await db.collection('conversations').createIndex({ title: 'text' });
    
    // 消息集合索引
    await db.collection('messages').createIndex({ conversationId: 1 });
    await db.collection('messages').createIndex({ userId: 1 });
    await db.collection('messages').createIndex({ createdAt: -1 });
    await db.collection('messages').createIndex({ content: 'text' });
    
    // 客户集合索引
    await db.collection('customers').createIndex({ userId: 1 });
    await db.collection('customers').createIndex({ email: 1 });
    await db.collection('customers').createIndex({ phone: 1 });
    await db.collection('customers').createIndex({ name: 'text', company: 'text' });
    await db.collection('customers').createIndex({ createdAt: -1 });
    
    // 项目集合索引
    await db.collection('projects').createIndex({ userId: 1 });
    await db.collection('projects').createIndex({ customerId: 1 });
    await db.collection('projects').createIndex({ status: 1 });
    await db.collection('projects').createIndex({ name: 'text', description: 'text' });
    await db.collection('projects').createIndex({ createdAt: -1 });
    
    // 合同集合索引
    await db.collection('contracts').createIndex({ userId: 1 });
    await db.collection('contracts').createIndex({ customerId: 1 });
    await db.collection('contracts').createIndex({ projectId: 1 });
    await db.collection('contracts').createIndex({ status: 1 });
    await db.collection('contracts').createIndex({ title: 'text', content: 'text' });
    await db.collection('contracts').createIndex({ createdAt: -1 });
    
    // 财务记录集合索引
    await db.collection('financerecords').createIndex({ userId: 1 });
    await db.collection('financerecords').createIndex({ projectId: 1 });
    await db.collection('financerecords').createIndex({ contractId: 1 });
    await db.collection('financerecords').createIndex({ type: 1 });
    await db.collection('financerecords').createIndex({ date: -1 });
    await db.collection('financerecords').createIndex({ createdAt: -1 });
    
    // 文件集合索引
    await db.collection('files').createIndex({ userId: 1 });
    await db.collection('files').createIndex({ filename: 1 });
    await db.collection('files').createIndex({ mimetype: 1 });
    await db.collection('files').createIndex({ createdAt: -1 });
    
    // RAG服务相关索引
    // 知识库集合索引
    await db.collection('knowledgebases').createIndex({ userId: 1 });
    await db.collection('knowledgebases').createIndex({ name: 1 });
    await db.collection('knowledgebases').createIndex({ isPublic: 1 });
    await db.collection('knowledgebases').createIndex({ status: 1 });
    await db.collection('knowledgebases').createIndex({ tags: 1 });
    await db.collection('knowledgebases').createIndex({ category: 1 });
    await db.collection('knowledgebases').createIndex({ name: 'text', description: 'text' });
    await db.collection('knowledgebases').createIndex({ createdAt: -1 });
    await db.collection('knowledgebases').createIndex({ updatedAt: -1 });
    
    // 文档集合索引
    await db.collection('documents').createIndex({ knowledgeBaseId: 1 });
    await db.collection('documents').createIndex({ userId: 1 });
    await db.collection('documents').createIndex({ filename: 1 });
    await db.collection('documents').createIndex({ originalName: 1 });
    await db.collection('documents').createIndex({ mimeType: 1 });
    await db.collection('documents').createIndex({ status: 1 });
    await db.collection('documents').createIndex({ processingStatus: 1 });
    await db.collection('documents').createIndex({ embeddingStatus: 1 });
    await db.collection('documents').createIndex({ vectorStatus: 1 });
    await db.collection('documents').createIndex({ isActive: 1 });
    await db.collection('documents').createIndex({ isDeleted: 1 });
    await db.collection('documents').createIndex({ tags: 1 });
    await db.collection('documents').createIndex({ category: 1 });
    await db.collection('documents').createIndex({ 'metadata.title': 'text', 'metadata.author': 'text', 'metadata.keywords': 'text' });
    await db.collection('documents').createIndex({ createdAt: -1 });
    await db.collection('documents').createIndex({ updatedAt: -1 });
    await db.collection('documents').createIndex({ 'processing.processedAt': -1 });
    await db.collection('documents').createIndex({ 'embedding.generatedAt': -1 });
    await db.collection('documents').createIndex({ 'vector.insertedAt': -1 });
    
    // 聊天会话集合索引
    await db.collection('chatsessions').createIndex({ userId: 1 });
    await db.collection('chatsessions').createIndex({ knowledgeBaseId: 1 });
    await db.collection('chatsessions').createIndex({ sessionId: 1 }, { unique: true });
    await db.collection('chatsessions').createIndex({ status: 1 });
    await db.collection('chatsessions').createIndex({ isPublic: 1 });
    await db.collection('chatsessions').createIndex({ isArchived: 1 });
    await db.collection('chatsessions').createIndex({ isDeleted: 1 });
    await db.collection('chatsessions').createIndex({ tags: 1 });
    await db.collection('chatsessions').createIndex({ category: 1 });
    await db.collection('chatsessions').createIndex({ title: 'text' });
    await db.collection('chatsessions').createIndex({ createdAt: -1 });
    await db.collection('chatsessions').createIndex({ updatedAt: -1 });
    await db.collection('chatsessions').createIndex({ 'statistics.lastMessageAt': -1 });
    await db.collection('chatsessions').createIndex({ 'sharing.sharedAt': -1 });
    await db.collection('chatsessions').createIndex({ 'sharing.expiresAt': 1 });
    
    // 复合索引优化查询性能
    await db.collection('knowledgebases').createIndex({ userId: 1, status: 1, isPublic: 1 });
    await db.collection('documents').createIndex({ knowledgeBaseId: 1, status: 1, isActive: 1 });
    await db.collection('documents').createIndex({ userId: 1, processingStatus: 1 });
    await db.collection('chatsessions').createIndex({ userId: 1, knowledgeBaseId: 1, status: 1 });
    await db.collection('chatsessions').createIndex({ knowledgeBaseId: 1, isPublic: 1, isArchived: 1 });
    
    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error('Failed to create database indexes:', error);
  }
};

/**
 * 数据库健康检查
 */
const checkDBHealth = async () => {
  try {
    const adminDb = mongoose.connection.db.admin();
    const result = await adminDb.ping();
    return result.ok === 1;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
};

/**
 * 获取数据库统计信息
 */
const getDBStats = async () => {
  try {
    const db = mongoose.connection.db;
    const stats = await db.stats();
    return {
      collections: stats.collections,
      dataSize: stats.dataSize,
      storageSize: stats.storageSize,
      indexes: stats.indexes,
      indexSize: stats.indexSize,
      objects: stats.objects
    };
  } catch (error) {
    logger.error('Failed to get database stats:', error);
    return null;
  }
};

module.exports = {
  connectDB,
  createIndexes,
  checkDBHealth,
  getDBStats
};