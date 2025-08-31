const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const cheerio = require('cheerio');
const { convert } = require('html-to-text');
const logger = require('../utils/logger');
const { DocumentProcessingError } = require('../middleware/errorHandler');
const embeddingService = require('./embeddingService');
const vectorDBService = require('./vectorService');

class DocumentProcessor {
  constructor() {
    this.supportedTypes = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-excel': 'xls',
      'text/plain': 'txt',
      'text/html': 'html',
      'text/markdown': 'md',
      'application/json': 'json',
      'text/csv': 'csv',
    };

    this.config = {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024, // 50MB
      chunkSize: parseInt(process.env.CHUNK_SIZE, 10) || 1000,
      chunkOverlap: parseInt(process.env.CHUNK_OVERLAP, 10) || 200,
      minChunkSize: parseInt(process.env.MIN_CHUNK_SIZE, 10) || 100,
      maxChunks: parseInt(process.env.MAX_CHUNKS, 10) || 1000,
      tempDir: process.env.TEMP_DIR || '/tmp/rag-service',
      cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL, 10) || 3600000, // 1 hour
    };

    // Ensure temp directory exists
    this.ensureTempDir();

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Process uploaded document
   */
  async processDocument(file, knowledgeBaseId, metadata = {}) {
    let tempFilePath = null;

    try {
      logger.logDocumentProcessing('Starting document processing', {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        knowledgeBaseId,
      });

      // Validate file
      this.validateFile(file);

      // Save file temporarily
      tempFilePath = await this.saveTempFile(file);

      // Extract text content
      const content = await this.extractContent(tempFilePath, file.mimetype);

      if (!content || content.trim().length === 0) {
        throw new DocumentProcessingError('No text content extracted from document');
      }

      // Split into chunks
      const chunks = this.splitIntoChunks(content);

      if (chunks.length === 0) {
        throw new DocumentProcessingError('No valid chunks created from document');
      }

      // Generate embeddings for chunks
      const embeddings = await embeddingService.getBatchEmbeddings(
        chunks.map((chunk) => chunk.content),
      );

      // Prepare document data
      const documentData = {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        knowledgeBaseId,
        metadata: {
          ...metadata,
          processedAt: new Date(),
          chunkCount: chunks.length,
          contentLength: content.length,
        },
        chunks: chunks.map((chunk, index) => ({
          ...chunk,
          embedding: embeddings[index],
          chunkIndex: index,
        })),
      };

      // Store in vector database
      const updatedDocumentData = await this.storeInVectorDB(documentData);
      Object.assign(documentData, updatedDocumentData);

      logger.logDocumentProcessing('Document processing completed', {
        filename: file.originalname,
        chunkCount: chunks.length,
        knowledgeBaseId,
      });

      return {
        success: true,
        documentId: documentData.documentId,
        filename: file.originalname,
        chunkCount: chunks.length,
        contentLength: content.length,
        metadata: documentData.metadata,
      };
    } catch (error) {
      logger.logError('Document processing failed', error, {
        filename: file?.originalname,
        knowledgeBaseId,
      });

      if (error instanceof DocumentProcessingError) {
        throw error;
      }

      throw new DocumentProcessingError('Failed to process document', error.message);
    } finally {
      // Clean up temp file
      if (tempFilePath) {
        await this.cleanupTempFile(tempFilePath);
      }
    }
  }

  /**
   * Validate uploaded file
   */
  validateFile(file) {
    if (!file) {
      throw new DocumentProcessingError('No file provided');
    }

    if (file.size > this.config.maxFileSize) {
      throw new DocumentProcessingError(
        `File too large: ${file.size} bytes exceeds limit of ${this.config.maxFileSize} bytes`,
      );
    }

    if (!this.supportedTypes[file.mimetype]) {
      throw new DocumentProcessingError(
        `Unsupported file type: ${file.mimetype}. Supported types: ${Object.keys(this.supportedTypes).join(', ')}`,
      );
    }
  }

  /**
   * Save file temporarily
   */
  async saveTempFile(file) {
    try {
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2);
      const extension = path.extname(file.originalname) || '.tmp';
      const filename = `${timestamp}_${randomId}${extension}`;
      const tempFilePath = path.join(this.config.tempDir, filename);

      await fs.writeFile(tempFilePath, file.buffer);

      logger.logDocumentProcessing('File saved temporarily', {
        originalName: file.originalname,
        tempPath: tempFilePath,
        size: file.size,
      });

      return tempFilePath;
    } catch (error) {
      throw new DocumentProcessingError('Failed to save temporary file', error.message);
    }
  }

  /**
   * Extract content from file based on type
   */
  async extractContent(filePath, mimetype) {
    const fileType = this.supportedTypes[mimetype];

    try {
      switch (fileType) {
      case 'pdf':
        return await DocumentProcessor.extractPDFContent(filePath);
      case 'docx':
        return await DocumentProcessor.extractDocxContent(filePath);
      case 'xlsx':
      case 'xls':
        return await DocumentProcessor.extractExcelContent(filePath);
      case 'txt':
      case 'md':
        return await DocumentProcessor.extractTextContent(filePath);
      case 'html':
        return await DocumentProcessor.extractHTMLContent(filePath);
      case 'json':
        return await DocumentProcessor.extractJSONContent(filePath);
      case 'csv':
        return await DocumentProcessor.extractCSVContent(filePath);
      default:
        throw new DocumentProcessingError(`Unsupported file type: ${fileType}`);
      }
    } catch (error) {
      if (error instanceof DocumentProcessingError) {
        throw error;
      }
      throw new DocumentProcessingError(`Failed to extract content from ${fileType} file`, error.message);
    }
  }

  /**
   * Extract content from PDF
   */
  static async extractPDFContent(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      throw new DocumentProcessingError('Failed to extract PDF content', error.message);
    }
  }

  /**
   * Extract content from DOCX
   */
  static async extractDocxContent(filePath) {
    try {
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new DocumentProcessingError('Failed to extract DOCX content', error.message);
    }
  }

  /**
   * Extract content from Excel files
   */
  static async extractExcelContent(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      let content = '';

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_csv(sheet);
        content += `Sheet: ${sheetName}\n${sheetData}\n\n`;
      });

      return content;
    } catch (error) {
      throw new DocumentProcessingError('Failed to extract Excel content', error.message);
    }
  }

  /**
   * Extract content from text files
   */
  static async extractTextContent(filePath) {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      throw new DocumentProcessingError('Failed to extract text content', error.message);
    }
  }

  /**
   * Extract content from HTML
   */
  static async extractHTMLContent(filePath) {
    try {
      const html = await fs.readFile(filePath, 'utf8');
      const $ = cheerio.load(html);

      // Remove script and style elements
      $('script, style').remove();

      // Extract text content
      const text = convert($.html(), {
        wordwrap: false,
        ignoreHref: true,
        ignoreImage: true,
      });

      return text;
    } catch (error) {
      throw new DocumentProcessingError('Failed to extract HTML content', error.message);
    }
  }

  /**
   * Extract content from JSON
   */
  static async extractJSONContent(filePath) {
    try {
      const jsonContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(jsonContent);

      // Convert JSON to readable text
      return this.jsonToText(data);
    } catch (error) {
      throw new DocumentProcessingError('Failed to extract JSON content', error.message);
    }
  }

  /**
   * Extract content from CSV
   */
  static async extractCSVContent(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_csv(sheet);
    } catch (error) {
      throw new DocumentProcessingError('Failed to extract CSV content', error.message);
    }
  }

  /**
   * Convert JSON object to readable text
   */
  static jsonToText(obj, prefix = '') {
    let text = '';

    if (typeof obj === 'object' && obj !== null) {
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          text += this.jsonToText(item, `${prefix}[${index}] `);
        });
      } else {
        Object.entries(obj).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            text += `${prefix}${key}:\n`;
            text += this.jsonToText(value, `${prefix}  `);
          } else {
            text += `${prefix}${key}: ${value}\n`;
          }
        });
      }
    } else {
      text += `${prefix}${obj}\n`;
    }

    return text;
  }

  /**
   * Split content into chunks
   */
  splitIntoChunks(content) {
    const chunks = [];
    const sentences = DocumentProcessor.splitIntoSentences(content);

    let currentChunk = '';
    let currentChunkSize = 0;

    sentences.forEach((sentence) => {
      const sentenceSize = sentence.length;

      // If adding this sentence would exceed chunk size, save current chunk
      if (currentChunkSize + sentenceSize > this.config.chunkSize && currentChunk.length > 0) {
        if (currentChunk.trim().length >= this.config.minChunkSize) {
          chunks.push({
            content: currentChunk.trim(),
            size: currentChunkSize,
            startIndex: chunks.length > 0 ? chunks[chunks.length - 1].endIndex : 0,
          });

          // Add overlap from previous chunk
          const overlapText = DocumentProcessor.getOverlapText(currentChunk, this.config.chunkOverlap);
          currentChunk = overlapText + sentence;
          currentChunkSize = overlapText.length + sentenceSize;
        } else {
          currentChunk += sentence;
          currentChunkSize += sentenceSize;
        }
      } else {
        currentChunk += sentence;
        currentChunkSize += sentenceSize;
      }

      // Prevent chunks from becoming too large
      if (chunks.length >= this.config.maxChunks) {
        logger.logDocumentProcessing('Maximum chunk limit reached', {
          maxChunks: this.config.maxChunks,
          contentLength: content.length,
        });
      }
    });

    // Add the last chunk if it has content
    if (currentChunk.trim().length >= this.config.minChunkSize) {
      chunks.push({
        content: currentChunk.trim(),
        size: currentChunkSize,
        startIndex: chunks.length > 0 ? chunks[chunks.length - 1].endIndex : 0,
      });
    }

    // Set end indices
    const processedChunks = chunks.map((chunk, index) => ({
      ...chunk,
      endIndex: chunk.startIndex + chunk.content.length,
      chunkId: `chunk_${index}`,
    }));
    chunks.splice(0, chunks.length, ...processedChunks);

    return chunks;
  }

  /**
   * Split content into sentences
   */
  static splitIntoSentences(content) {
    // Simple sentence splitting - can be improved with more sophisticated NLP
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => `${s}. `);

    return sentences;
  }

  /**
   * Get overlap text from the end of a chunk
   */
  static getOverlapText(text, overlapSize) {
    if (text.length <= overlapSize) {
      return text;
    }

    const overlapText = text.slice(-overlapSize);

    // Try to break at word boundary
    const spaceIndex = overlapText.indexOf(' ');
    if (spaceIndex > 0) {
      return overlapText.slice(spaceIndex + 1);
    }

    return overlapText;
  }

  /**
   * Store document and chunks in vector database
   */
  async storeInVectorDB(documentData) {
    try {
      const documentId = this.generateDocumentId();
      const updatedDocumentData = {
        ...documentData,
        documentId,
      };

      // Prepare vectors for insertion
      const vectors = updatedDocumentData.chunks.map((chunk) => ({
        id: `${documentId}_${chunk.chunkId}`,
        vector: chunk.embedding,
        payload: {
          documentId,
          chunkId: chunk.chunkId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          size: chunk.size,
          startIndex: chunk.startIndex,
          endIndex: chunk.endIndex,
          filename: updatedDocumentData.filename,
          mimetype: updatedDocumentData.mimetype,
          knowledgeBaseId: updatedDocumentData.knowledgeBaseId,
          metadata: updatedDocumentData.metadata,
          createdAt: new Date().toISOString(),
        },
      }));

      // Insert vectors into collection
      await vectorDBService.insertVectors(
        updatedDocumentData.knowledgeBaseId,
        vectors,
      );

      logger.logDocumentProcessing('Document stored in vector database', {
        documentId,
        knowledgeBaseId: updatedDocumentData.knowledgeBaseId,
        vectorCount: vectors.length,
      });

      return updatedDocumentData;
    } catch (error) {
      throw new DocumentProcessingError('Failed to store document in vector database', error.message);
    }
  }

  /**
   * Generate unique document ID
   */
  static generateDocumentId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return `doc_${timestamp}_${random}`;
  }

  /**
   * Delete document from vector database
   */
  static async deleteDocument(documentId, knowledgeBaseId) {
    try {
      await vectorDBService.deleteByDocumentId(knowledgeBaseId, documentId);

      logger.logDocumentProcessing('Document deleted from vector database', {
        documentId,
        knowledgeBaseId,
      });

      return { success: true, documentId };
    } catch (error) {
      logger.logError('Failed to delete document', error, {
        documentId,
        knowledgeBaseId,
      });

      throw new DocumentProcessingError('Failed to delete document', error.message);
    }
  }

  /**
   * Get document information
   */
  static async getDocumentInfo(documentId, knowledgeBaseId) {
    try {
      // This would typically query the vector database for document metadata
      // For now, we'll return a placeholder implementation
      const results = await vectorDBService.searchVectors(
        knowledgeBaseId,
        [], // empty vector for metadata query
        {
          filter: {
            must: [{ key: 'documentId', match: { value: documentId } }],
          },
          limit: 1,
        },
      );

      if (results.length === 0) {
        throw new DocumentProcessingError('Document not found');
      }

      const document = results[0].payload;

      return {
        documentId: document.documentId,
        filename: document.filename,
        mimetype: document.mimetype,
        knowledgeBaseId: document.knowledgeBaseId,
        metadata: document.metadata,
        createdAt: document.createdAt,
      };
    } catch (error) {
      if (error instanceof DocumentProcessingError) {
        throw error;
      }

      throw new DocumentProcessingError('Failed to get document info', error.message);
    }
  }

  /**
   * Ensure temp directory exists
   */
  async ensureTempDir() {
    try {
      await fs.mkdir(this.config.tempDir, { recursive: true });
    } catch (error) {
      logger.logError('Failed to create temp directory', error, {
        tempDir: this.config.tempDir,
      });
    }
  }

  /**
   * Clean up temporary file
   */
  static async cleanupTempFile(filePath) {
    try {
      await fs.unlink(filePath);
      logger.logDocumentProcessing('Temporary file cleaned up', { filePath });
    } catch (error) {
      logger.logError('Failed to cleanup temp file', error, { filePath });
    }
  }

  /**
   * Start cleanup interval for old temp files
   */
  startCleanupInterval() {
    setInterval(async () => {
      try {
        await this.cleanupOldTempFiles();
      } catch (error) {
        logger.logError('Failed to cleanup old temp files', error);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Clean up old temporary files
   */
  async cleanupOldTempFiles() {
    try {
      const files = await fs.readdir(this.config.tempDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      const cleanupPromises = files.map(async (file) => {
        const filePath = path.join(this.config.tempDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          logger.logDocumentProcessing('Old temp file cleaned up', { filePath });
        }
      });

      await Promise.all(cleanupPromises);
    } catch (error) {
      logger.logError('Failed to cleanup old temp files', error);
    }
  }

  /**
   * Get supported file types
   */
  getSupportedTypes() {
    return Object.keys(this.supportedTypes).map((mimetype) => ({
      mimetype,
      extension: this.supportedTypes[mimetype],
    }));
  }

  /**
   * Get processing statistics
   */
  getProcessingStats() {
    return {
      supportedTypes: Object.keys(this.supportedTypes).length,
      maxFileSize: this.config.maxFileSize,
      chunkSize: this.config.chunkSize,
      chunkOverlap: this.config.chunkOverlap,
      minChunkSize: this.config.minChunkSize,
      maxChunks: this.config.maxChunks,
    };
  }
}

// Create singleton instance
const documentProcessor = new DocumentProcessor();

module.exports = documentProcessor;
