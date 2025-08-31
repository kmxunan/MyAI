import axios from 'axios';
import { config, getRagApiUrl } from '../config';

// 创建axios实例
const ragApi = axios.create({
  baseURL: getRagApiUrl(),
  timeout: config.api.ragTimeout,
});

// 请求拦截器 - 添加认证token
ragApi.interceptors.request.use(
  (config) => {
    const authStorage = localStorage.getItem(config.auth.tokenKey);
    if (authStorage) {
      try {
        const authData = JSON.parse(authStorage);
        const token = authData.state?.token;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error('Error parsing auth token:', error);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误
ragApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 仅透传401错误，由上层路由守卫/页面逻辑处理登出与跳转，避免循环重定向
    }
    return Promise.reject(error);
  }
);

export const ragService = {
  // 获取知识库列表
  async getKnowledgeBases(params = {}) {
    try {
      const response = await ragApi.get('/knowledge-bases', { params });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch knowledge bases:', error);
      throw error;
    }
  },

  // 创建知识库
  async createKnowledgeBase(data) {
    try {
      const response = await ragApi.post('/knowledge-bases', data);
      return response.data;
    } catch (error) {
      console.error('Failed to create knowledge base:', error);
      throw error;
    }
  },

  // 获取知识库详情
  async getKnowledgeBase(id) {
    try {
      const response = await ragApi.get(`/knowledge-bases/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch knowledge base:', error);
      throw error;
    }
  },

  // 更新知识库
  async updateKnowledgeBase(id, data) {
    try {
      const response = await ragApi.put(`/knowledge-bases/${id}`, data);
      return response.data;
    } catch (error) {
      console.error('Failed to update knowledge base:', error);
      throw error;
    }
  },

  // 删除知识库
  async deleteKnowledgeBase(id) {
    try {
      const response = await ragApi.delete(`/knowledge-bases/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to delete knowledge base:', error);
      throw error;
    }
  },

  // 上传文档
  async uploadDocuments(knowledgeBaseId, files, metadata = {}) {
    try {
      const formData = new FormData();
      formData.append('knowledgeBaseId', knowledgeBaseId);
      
      // 添加文件
      files.forEach((file) => {
        formData.append('files', file);
      });
      
      // 添加元数据
      if (Object.keys(metadata).length > 0) {
        formData.append('metadata', JSON.stringify(metadata));
      }
      
      const response = await ragApi.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          // 可以通过回调函数处理上传进度
          if (metadata.onProgress) {
            metadata.onProgress(percentCompleted);
          }
        },
      });
      
      return response.data;
    } catch (error) {
      console.error('Failed to upload documents:', error);
      throw error;
    }
  },

  // 获取文档列表
  async getDocuments(knowledgeBaseId, params = {}) {
    try {
      const response = await ragApi.get(`/documents/${knowledgeBaseId}`, {
        params: { ...params }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      throw error;
    }
  },

  // 删除文档
  async deleteDocument(knowledgeBaseId, documentId) {
    try {
      const response = await ragApi.delete(`/documents/${knowledgeBaseId}/${documentId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to delete document:', error);
      throw error;
    }
  },

  // 获取对话列表
  async getConversations(params = {}) {
    try {
      const response = await ragApi.get('/conversations', {
        params: { ...params }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      throw error;
    }
  },

  // 搜索文档
  async searchDocuments(query, knowledgeBaseId, options = {}) {
    try {
      const response = await ragApi.post('/search', {
        query,
        knowledgeBaseId,
        ...options
      });
      return response.data;
    } catch (error) {
      console.error('Failed to search documents:', error);
      throw error;
    }
  },

  // RAG聊天
  async chat(message, knowledgeBaseId, options = {}) {
    try {
      const response = await ragApi.post('/chat', {
        message,
        knowledgeBaseId,
        ...options
      });
      return response.data;
    } catch (error) {
      console.error('Failed to chat with RAG:', error);
      throw error;
    }
  },

  // 获取RAG统计信息
  async getStats(timeRange = 30) {
    try {
      const response = await ragApi.get('/stats', {
        params: { timeRange }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch RAG stats:', error);
      throw error;
    }
  },

  // 检查RAG服务健康状态
  async checkHealth() {
    try {
      const response = await ragApi.get('/health');
      return response.data;
    } catch (error) {
      console.error('Failed to check RAG health:', error);
      throw error;
    }
  }
};

export default ragService;