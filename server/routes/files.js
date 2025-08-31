const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const fileProcessingService = require('../services/fileProcessingService');
const logger = require('../utils/logger');

const router = express.Router();

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
  }
};

// 配置multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10 // 最多10个文件
  }
});

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     summary: 上传并处理文件
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *               description:
 *                 type: string
 *                 description: 文件描述
 *     responses:
 *       200:
 *         description: 文件上传和处理成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       data:
 *                         type: object
 *                       error:
 *                         type: string
 */// 文件上传路由
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const files = file ? [file] : [];    const { description } = req.body;
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要上传的文件'
      });
    }

    logger.info(`用户 ${req.user.id} 上传了 ${files.length} 个文件`);

    // 处理所有文件
    const results = [];
    
    for (const file of files) {
      try {
        // 验证文件大小
        fileProcessingService.validateFileSize(file.path);
        
        // 处理文件
        const processedData = await fileProcessingService.processFile(file.path, file.mimetype);
        
        results.push({
          filename: file.originalname,
          success: true,
          data: {
            ...processedData,
            originalName: file.originalname,
            size: file.size,
            uploadedAt: new Date(),
            description: description || ''
          }
        });
        
        // 清理临时文件
        await fileProcessingService.cleanupFile(file.path);
        
      } catch (error) {
        logger.error(`处理文件失败: ${file.originalname}`, error);
        
        results.push({
          filename: file.originalname,
          success: false,
          error: error.message
        });
        
        // 清理临时文件
        await fileProcessingService.cleanupFile(file.path);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `文件处理完成: ${successCount} 个成功, ${failCount} 个失败`,
      data: results,
      summary: {
        total: files.length,
        success: successCount,
        failed: failCount
      }
    });

  } catch (error) {
    logger.error('文件上传处理失败:', error);
    
    // 清理所有临时文件
    if (req.files) {
      for (const file of req.files) {
        await fileProcessingService.cleanupFile(file.path);
      }
    }
    
    res.status(500).json({
      success: false,
      message: '文件上传处理失败',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/files/supported-types:
 *   get:
 *     summary: 获取支持的文件类型
 *     tags: [Files]
 *     responses:
 *       200:
 *         description: 支持的文件类型列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     supportedTypes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           mimeType:
 *                             type: string
 *                           extension:
 *                             type: string
 *                           description:
 *                             type: string
 */
router.get('/supported-types', (req, res) => {
  const supportedTypes = [
    {
      mimeType: 'application/pdf',
      extension: '.pdf',
      description: 'PDF文档'
    },
    {
      mimeType: 'text/plain',
      extension: '.txt',
      description: '纯文本文件'
    },
    {
      mimeType: 'text/csv',
      extension: '.csv',
      description: 'CSV表格文件'
    },
    {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: '.docx',
      description: 'Word文档 (新版)'
    },
    {
      mimeType: 'application/msword',
      extension: '.doc',
      description: 'Word文档 (旧版)'
    }
  ];

  res.json({
    success: true,
    data: {
      supportedTypes,
      maxFileSize: '50MB',
      maxFiles: 10
    }
  });
});

/**
 * @swagger
 * /api/files/process-text:
 *   post:
 *     summary: 直接处理文本内容
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: 要处理的文本内容
 *               title:
 *                 type: string
 *                 description: 文本标题
 *     responses:
 *       200:
 *         description: 文本处理成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     content:
 *                       type: string
 *                     wordCount:
 *                       type: number
 *                     processedAt:
 *                       type: string
 */
router.post('/process-text', [
  authMiddleware,
  body('content').notEmpty().withMessage('文本内容不能为空'),
  body('title').optional().isString().withMessage('标题必须是字符串')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: '输入验证失败',
        errors: errors.array()
      });
    }

    const { content, title } = req.body;
    
    const wordCount = fileProcessingService.countWords(content);
    
    res.json({
      success: true,
      data: {
        type: 'text',
        content: content,
        title: title || '未命名文本',
        wordCount: wordCount,
        processedAt: new Date(),
        metadata: {
          length: content.length,
          lines: content.split('\n').length
        }
      }
    });

  } catch (error) {
    logger.error('文本处理失败:', error);
    res.status(500).json({
      success: false,
      message: '文本处理失败',
      error: error.message
    });
  }
});

// 错误处理中间件
router.use((error, req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '文件大小超过限制 (最大50MB)'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: '文件数量超过限制 (最多10个文件)'
      });
    }
  }
  
  logger.error('文件路由错误:', error);
  res.status(500).json({
    success: false,
    message: error.message || '服务器内部错误'
  });
});

module.exports = router;