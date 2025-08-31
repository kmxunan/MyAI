const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { ValidationError, ProcessingError } = require('../utils/errors');

/**
 * 文档处理服务类
 * 负责文档上传、解析、分块和预处理
 */
class DocumentProcessingService {
  constructor() {
    this.supportedFormats = [
      'text/plain',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown',
      'text/html',
      'application/json'
    ];
    
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    this.chunkSize = parseInt(process.env.DEFAULT_CHUNK_SIZE) || 1000;
    this.chunkOverlap = parseInt(process.env.DEFAULT_CHUNK_OVERLAP) || 200;
    
    this.stats = {
      documentsProcessed: 0,
      totalSize: 0,
      chunksGenerated: 0,
      errors: 0,
      processingTime: 0
    };
    
    this.initializeUploadDir();
  }

  /**
   * 初始化上传目录
   */
  initializeUploadDir() {
    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
        logger.info(`Created upload directory: ${this.uploadDir}`);
      }
    } catch (error) {
      logger.error('Failed to create upload directory:', error);
      throw new ProcessingError('Failed to initialize upload directory');
    }
  }

  /**
   * 配置multer中间件
   */
  getMulterConfig() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      }
    });

    const fileFilter = (req, file, cb) => {
      if (this.supportedFormats.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new ValidationError(`Unsupported file format: ${file.mimetype}`), false);
      }
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: this.maxFileSize
      }
    });
  }

  /**
   * 处理上传的文档
   */
  async processDocument(file, options = {}) {
    const startTime = Date.now();
    
    try {
      // 验证文件
      this.validateFile(file);
      
      // 生成文档ID
      const documentId = uuidv4();
      
      // 计算文件校验和
      const checksum = await this.calculateChecksum(file.path);
      
      // 提取文本内容
      const extractedText = await this.extractText(file);
      
      // 检测语言
      const language = this.detectLanguage(extractedText);
      
      // 生成文档分块
      const chunks = await this.generateChunks(extractedText, {
        chunkSize: options.chunkSize || this.chunkSize,
        overlap: options.chunkOverlap || this.chunkOverlap
      });
      
      // 构建处理结果
      const result = {
        documentId,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        encoding: file.encoding,
        extension: path.extname(file.originalname),
        checksum,
        extractedText,
        textLength: extractedText.length,
        language,
        chunks: chunks.map((chunk, index) => ({
          id: `${documentId}-chunk-${index}`,
          content: chunk.content,
          metadata: {
            chunkIndex: index,
            startChar: chunk.startChar,
            endChar: chunk.endChar,
            wordCount: chunk.content.split(/\s+/).length
          }
        })),
        chunkCount: chunks.length,
        processingTime: Date.now() - startTime,
        processedAt: new Date()
      };
      
      // 更新统计信息
      this.updateStats({
        documentsProcessed: 1,
        totalSize: file.size,
        chunksGenerated: chunks.length,
        processingTime: result.processingTime
      });
      
      logger.info(`Document processed successfully: ${documentId}`);
      return result;
      
    } catch (error) {
      this.stats.errors++;
      logger.error('Document processing failed:', error);
      
      // 清理上传的文件
      if (file && file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      
      throw error;
    }
  }

  /**
   * 验证文件
   */
  validateFile(file) {
    if (!file) {
      throw new ValidationError('No file provided');
    }
    
    if (!this.supportedFormats.includes(file.mimetype)) {
      throw new ValidationError(`Unsupported file format: ${file.mimetype}`);
    }
    
    if (file.size > this.maxFileSize) {
      throw new ValidationError(`File size exceeds limit: ${file.size} > ${this.maxFileSize}`);
    }
    
    if (!fs.existsSync(file.path)) {
      throw new ValidationError('File not found on disk');
    }
  }

  /**
   * 计算文件校验和
   */
  async calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * 提取文本内容
   */
  async extractText(file) {
    try {
      switch (file.mimetype) {
      case 'text/plain':
      case 'text/markdown':
      case 'text/html':
        return fs.readFileSync(file.path, 'utf8');
        
      case 'application/json': {
        const jsonContent = JSON.parse(fs.readFileSync(file.path, 'utf8'));
        return JSON.stringify(jsonContent, null, 2);
      }
        
      case 'application/pdf':
        // 这里应该使用PDF解析库，如pdf-parse
        // 为了简化，暂时返回占位符
        return 'PDF content extraction not implemented yet';
        
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        // 这里应该使用Word文档解析库，如mammoth
        // 为了简化，暂时返回占位符
        return 'Word document extraction not implemented yet';
        
      default:
        throw new ProcessingError(`Text extraction not supported for ${file.mimetype}`);
      }
    } catch (error) {
      logger.error('Text extraction failed:', error);
      throw new ProcessingError(`Failed to extract text: ${error.message}`);
    }
  }

  /**
   * 检测文本语言
   */
  detectLanguage(text) {
    // 简单的语言检测逻辑
    // 在实际应用中，应该使用专门的语言检测库
    const chineseRegex = /[\u4e00-\u9fff]/;
    const englishRegex = /[a-zA-Z]/;
    
    const chineseCount = (text.match(chineseRegex) || []).length;
    const englishCount = (text.match(englishRegex) || []).length;
    
    if (chineseCount > englishCount) {
      return 'zh';
    } else if (englishCount > 0) {
      return 'en';
    } else {
      return 'unknown';
    }
  }

  /**
   * 生成文档分块
   */
  async generateChunks(text, options = {}) {
    const { chunkSize = this.chunkSize, overlap = this.chunkOverlap } = options;
    const chunks = [];
    
    if (!text || text.length === 0) {
      return chunks;
    }
    
    // 按段落分割文本
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    let currentChunk = '';
    let startChar = 0;
    
    for (const paragraph of paragraphs) {
      // 如果当前段落加上现有块超过了块大小
      if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
        // 保存当前块
        chunks.push({
          content: currentChunk.trim(),
          startChar,
          endChar: startChar + currentChunk.length
        });
        
        // 开始新块，包含重叠内容
        const overlapText = this.getOverlapText(currentChunk, overlap);
        currentChunk = overlapText + paragraph;
        startChar = startChar + currentChunk.length - overlapText.length - paragraph.length;
      } else {
        // 添加到当前块
        if (currentChunk.length > 0) {
          currentChunk += '\n\n';
        }
        currentChunk += paragraph;
      }
    }
    
    // 添加最后一个块
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        startChar,
        endChar: startChar + currentChunk.length
      });
    }
    
    return chunks;
  }

  /**
   * 获取重叠文本
   */
  getOverlapText(text, overlapSize) {
    if (text.length <= overlapSize) {
      return text;
    }
    
    // 从末尾开始查找合适的分割点
    const overlapText = text.slice(-overlapSize);
    const sentenceEnd = overlapText.lastIndexOf('.');
    
    if (sentenceEnd > overlapSize * 0.5) {
      return overlapText.slice(sentenceEnd + 1).trim();
    }
    
    return overlapText;
  }

  /**
   * 删除文档文件
   */
  async deleteDocument(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Document file deleted: ${filePath}`);
      }
    } catch (error) {
      logger.error('Failed to delete document file:', error);
      throw new ProcessingError(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * 获取支持的文件格式
   */
  getSupportedFormats() {
    return [...this.supportedFormats];
  }

  /**
   * 更新统计信息
   */
  updateStats(updates) {
    Object.keys(updates).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(this.stats, key)) {
        this.stats[key] += updates[key];
      }
    });
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      documentsProcessed: 0,
      totalSize: 0,
      chunksGenerated: 0,
      errors: 0,
      processingTime: 0
    };
  }

  /**
   * 获取健康状态
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      supportedFormats: this.supportedFormats.length,
      maxFileSize: this.maxFileSize,
      uploadDir: this.uploadDir,
      uploadDirExists: fs.existsSync(this.uploadDir),
      stats: this.getStats()
    };
  }
}

module.exports = DocumentProcessingService;