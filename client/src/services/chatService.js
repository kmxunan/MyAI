import authService from './authService';

class ChatService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    this.api = authService.getApiInstance();
  }

  // 获取对话列表
  async getConversations(page = 1, limit = 20) {
    try {
      const response = await this.api.get('/chat/conversations', {
        params: { page, limit }
      });
      return response.data;
    } catch (error) {
      console.error('获取对话列表失败:', error);
      throw error;
    }
  }

  // 创建新对话
  async createConversation(data) {
    try {
      const response = await this.api.post('/chat/conversations', data);
      return response.data;
    } catch (error) {
      console.error('创建对话失败:', error);
      throw error;
    }
  }

  // 获取对话详情
  async getConversation(conversationId) {
    try {
      const response = await this.api.get(`/chat/conversations/${conversationId}`);
      return response.data;
    } catch (error) {
      console.error('获取对话详情失败:', error);
      throw error;
    }
  }

  // 更新对话
  async updateConversation(conversationId, data) {
    try {
      const response = await this.api.put(`/chat/conversations/${conversationId}`, data);
      return response.data;
    } catch (error) {
      console.error('更新对话失败:', error);
      throw error;
    }
  }

  // 删除对话
  async deleteConversation(conversationId) {
    try {
      const response = await this.api.delete(`/chat/conversations/${conversationId}`);
      return response.data;
    } catch (error) {
      console.error('删除对话失败:', error);
      throw error;
    }
  }

  // 获取消息列表
  async getMessages(conversationId, page = 1, limit = 50) {
    try {
      const response = await this.api.get(`/chat/conversations/${conversationId}/messages`, {
        params: { page, limit }
      });
      return response.data;
    } catch (error) {
      console.error('获取消息列表失败:', error);
      throw error;
    }
  }

  // 发送消息
  async sendMessage(conversationId, data) {
    try {
      const response = await this.api.post(`/chat/conversations/${conversationId}/messages`, data);
      return response.data;
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  }

  // 流式发送消息
  async sendStreamMessage(conversationId, data, onMessage, onError, onComplete) {
    try {
      const response = await fetch(`${this.baseURL}/api/chat/conversations/${conversationId}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (onComplete) onComplete();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留不完整的行

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              if (onComplete) onComplete();
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              if (onMessage) onMessage(parsed);
            } catch (e) {
              console.error('解析SSE数据失败:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('流式发送消息失败:', error);
      if (onError) onError(error);
      throw error;
    }
  }

  // 获取支持的模型列表
  async getSupportedModels() {
    try {
      const response = await this.api.get('/chat/models/categorized');
      
      // 将分类模型数据转换为扁平列表格式
      if (response.data.success && response.data.data) {
        const categorizedModels = response.data.data;
        const allModels = [];
        
        // 合并所有分类的模型
        Object.keys(categorizedModels).forEach(category => {
          if (Array.isArray(categorizedModels[category])) {
            allModels.push(...categorizedModels[category]);
          }
        });
        
        return {
          success: true,
          data: allModels
        };
      }
      
      return response.data;
    } catch (error) {
      console.error('获取模型列表失败:', error);
      throw error;
    }
  }

  // 获取分类的模型列表
  async getCategorizedModels() {
    try {
      const response = await this.api.get('/chat/models/categorized');
      return response.data;
    } catch (error) {
      console.error('获取分类模型列表失败:', error);
      throw error;
    }
  }

  // 获取模型详情
  async getModelInfo(modelId) {
    try {
      const response = await this.api.get(`/chat/models/${modelId}`);
      return response.data;
    } catch (error) {
      console.error('获取模型详情失败:', error);
      throw error;
    }
  }

  // 搜索对话
  async searchConversations(query, filters = {}) {
    try {
      const response = await this.api.get('/chat/search', {
        params: { q: query, ...filters }
      });
      return response.data;
    } catch (error) {
      console.error('搜索对话失败:', error);
      throw error;
    }
  }

  // 导出对话
  async exportConversation(conversationId, format = 'json') {
    try {
      const response = await this.api.get(`/chat/conversations/${conversationId}/export`, {
        params: { format },
        responseType: 'blob'
      });
      return response.data;
    } catch (error) {
      console.error('导出对话失败:', error);
      throw error;
    }
  }

  // 获取对话统计
  async getConversationStats(timeRange = '7d') {
    try {
      const response = await this.api.get('/chat/stats', {
        params: { timeRange }
      });
      return response.data;
    } catch (error) {
      console.error('获取对话统计失败:', error);
      throw error;
    }
  }

  // 批量删除对话
  async deleteConversations(conversationIds) {
    try {
      const response = await this.api.delete('/chat/conversations/batch', {
        data: { conversationIds }
      });
      return response.data;
    } catch (error) {
      console.error('批量删除对话失败:', error);
      throw error;
    }
  }

  // 标记消息
  async markMessage(messageId, action) {
    try {
      const response = await this.api.post(`/chat/messages/${messageId}/mark`, {
        action
      });
      return response.data;
    } catch (error) {
      console.error('标记消息失败:', error);
      throw error;
    }
  }

  // 重新生成回复
  async regenerateResponse(messageId) {
    try {
      const response = await this.api.post(`/chat/messages/${messageId}/regenerate`);
      return response.data;
    } catch (error) {
      console.error('重新生成回复失败:', error);
      throw error;
    }
  }

  // 获取消息反馈
  async getMessageFeedback(messageId) {
    try {
      const response = await this.api.get(`/chat/messages/${messageId}/feedback`);
      return response.data;
    } catch (error) {
      console.error('获取消息反馈失败:', error);
      throw error;
    }
  }

  // 提交消息反馈
  async submitMessageFeedback(messageId, feedback) {
    try {
      const response = await this.api.post(`/chat/messages/${messageId}/feedback`, feedback);
      return response.data;
    } catch (error) {
      console.error('提交消息反馈失败:', error);
      throw error;
    }
  }
}

export const chatService = new ChatService();
export default chatService;