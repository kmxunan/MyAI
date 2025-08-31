import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chatService } from '../services/chatService';
import { useAuthStore } from './authStore';
import { useSettingsStore } from '../services/settingsService';
import toast from 'react-hot-toast';

const useChatStore = create(
  persist(
    (set, get) => ({
      // 状态
      conversations: [],
      currentConversation: null,
      messages: [],
      supportedModels: [],
      isLoading: false,
      isStreaming: false,
      error: null,
      
      // 分页状态
      conversationsPagination: {
        page: 1,
        limit: 20,
        total: 0,
        hasMore: true
      },
      
      messagesPagination: {
        page: 1,
        limit: 50,
        total: 0,
        hasMore: true
      },
      
      // 搜索和过滤
      searchQuery: '',
      filters: {
        type: 'all',
        model: 'all',
        dateRange: 'all'
      },
      
      // 设置错误
      setError: (error) => set({ error }),
      
      // 清除错误
      clearError: () => set({ error: null }),
      
      // 设置加载状态
      setLoading: (isLoading) => set({ isLoading }),
      
      // 验证当前对话是否仍然有效
      validateCurrentConversation: async () => {
        const { currentConversation } = get();
        if (!currentConversation) return;
        
        const conversationId = currentConversation.id || currentConversation._id;
        if (!conversationId) {
          set({ currentConversation: null });
          return;
        }
        
        try {
          await chatService.getConversation(conversationId);
          // 如果成功，说明对话仍然有效，不需要做任何操作
        } catch (error) {
          // 如果失败（特别是404），清除无效的对话
          if (error.response?.status === 404) {
            console.warn(`清除无效的持久化对话: ${conversationId}`);
            set({ currentConversation: null, messages: [] });
          }
        }
      },
      
      // 设置流式状态
      setStreaming: (isStreaming) => set({ isStreaming }),
      
      // 获取对话列表
      fetchConversations: async (page = 1, reset = false) => {
        // 检查认证状态
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) {
          console.warn('User not authenticated, skipping fetchConversations');
          return;
        }
        
        try {
          set({ isLoading: true, error: null });
          
          const response = await chatService.getConversations(page, get().conversationsPagination.limit);
          
          set((state) => {
            // 去重逻辑：基于_id或id字段去重
            const existingIds = new Set(state.conversations.map(conv => conv._id || conv.id));
            const newConversations = response.data.filter(conv => !existingIds.has(conv._id || conv.id));
            
            return {
              conversations: reset ? response.data : [...state.conversations, ...newConversations],
              conversationsPagination: {
                ...state.conversationsPagination,
                page: response.pagination?.page ?? page,
                total: response.pagination?.total ?? (reset ? response.data.length : state.conversationsPagination.total),
                hasMore: response.pagination?.hasMore ?? (response.data?.length >= state.conversationsPagination.limit)
              },
              isLoading: false
            };
          });
          
          return response;
        } catch (error) {
          set({ error: error.message, isLoading: false });
          toast.error('获取对话列表失败');
          throw error;
        }
      },
      
      // 创建新对话
      createConversation: async (data) => {
        try {
          set({ isLoading: true, error: null });
          
          // 客户端模型验证
          const { supportedModels } = get();
          if (data.model && supportedModels.length > 0) {
            const modelId = data.model.provider && data.model.name 
              ? `${data.model.provider}/${data.model.name}`
              : data.model.name || data.model.id;
            
            const isValidModel = supportedModels.some(m => m.id === modelId);
            if (!isValidModel) {
              const errorMsg = `模型 '${modelId}' 不可用，请选择其他模型`;
              set({ error: errorMsg, isLoading: false });
              toast.error(errorMsg);
              throw new Error(errorMsg);
            }
          }
          
          const response = await chatService.createConversation(data);
          
          set((state) => ({
            conversations: [response.data, ...state.conversations],
            currentConversation: response.data,
            messages: [],
            isLoading: false
          }));
          
          toast.success('对话创建成功');
          return response.data;
        } catch (error) {
          // 处理服务器返回的模型验证错误
          if (error.response?.data?.code === 'INVALID_MODEL') {
            const errorMsg = error.response.data.message || '所选模型不可用';
            set({ error: errorMsg, isLoading: false });
            toast.error(errorMsg);
          } else {
            set({ error: error.message, isLoading: false });
            toast.error('创建对话失败');
          }
          throw error;
        }
      },
      
      // 选择当前对话
      setCurrentConversation: async (conversationId) => {
        try {
          set({ isLoading: true, error: null });
          
          const response = await chatService.getConversation(conversationId);
          
          set({
            currentConversation: response.data,
            messages: [],
            messagesPagination: {
              page: 1,
              limit: 50,
              total: 0,
              hasMore: true
            },
            isLoading: false
          });
          
          // 获取消息
          await get().fetchMessages(conversationId, 1, true);
          
          return response.data;
        } catch (error) {
          // 如果是404错误（对话不存在），清除当前对话而不显示错误
          if (error.response?.status === 404) {
            set({ 
              currentConversation: null, 
              messages: [], 
              isLoading: false, 
              error: null 
            });
            console.warn(`对话 ${conversationId} 不存在，已清除当前对话`);
            return null;
          }
          
          set({ error: error.message, isLoading: false });
          toast.error('获取对话失败');
          throw error;
        }
      },
      
      // 兼容旧调用：selectConversation -> setCurrentConversation
      selectConversation: async (conversationId) => {
        return await get().setCurrentConversation(conversationId);
      },
      
      // 更新对话
      updateConversation: async (conversationId, data) => {
        try {
          const response = await chatService.updateConversation(conversationId, data);
          
          set((state) => ({
            conversations: state.conversations.map(conv => 
              (conv.id === conversationId || conv._id === conversationId) ? response.data : conv
            ),
            currentConversation: (state.currentConversation?.id === conversationId || state.currentConversation?._id === conversationId)
              ? response.data 
              : state.currentConversation
          }));
          
          toast.success('对话更新成功');
          return response.data;
        } catch (error) {
          set({ error: error.message });
          toast.error('更新对话失败');
          throw error;
        }
      },
      
      // 删除对话
      deleteConversation: async (conversationId) => {
        try {
          const result = await chatService.deleteConversation(conversationId);
          
          set((state) => ({
            conversations: state.conversations.filter(conv => (conv.id ?? conv._id) !== conversationId),
            currentConversation: ((state.currentConversation?.id ?? state.currentConversation?._id) === conversationId) 
              ? null 
              : state.currentConversation,
            messages: ((state.currentConversation?.id ?? state.currentConversation?._id) === conversationId) ? [] : state.messages
          }));
          
          toast.success(result?.message || '对话删除成功');
        } catch (error) {
          set({ error: error.message });
          toast.error('删除对话失败');
          throw error;
        }
      },
      
      // 获取消息列表
      fetchMessages: async (conversationId, page = 1, reset = false) => {
        try {
          set({ isLoading: true, error: null });
          
          const response = await chatService.getMessages(conversationId, page, get().messagesPagination.limit);
          
          set((state) => ({
            messages: reset ? response.data : [...response.data, ...state.messages],
            messagesPagination: {
              ...state.messagesPagination,
              page: reset ? 1 : state.messagesPagination.page, // 后端使用游标，保持现有页码
              total: state.messagesPagination.total, // 无总数时保持不变
              hasMore: response.pagination?.hasMore ?? false,
              nextCursor: response.pagination?.nextCursor
            },
            isLoading: false
          }));
          
          return response;
        } catch (error) {
          set({ error: error.message, isLoading: false });
          toast.error('获取消息失败');
          throw error;
        }
      },
      
      // 发送消息
      sendMessage: async (conversationId, data) => {
        try {
          set({ error: null });
          
          // 添加用户消息到本地状态
          const userMessage = {
            id: `temp-${Date.now()}`,
            content: typeof data === 'string' ? data : data.content,
            role: 'user',
            timestamp: new Date().toISOString(),
            isTemporary: true
          };
          
          set((state) => ({
            messages: [...state.messages, userMessage]
          }));
          
          const payload = typeof data === 'string' ? { content: data } : data;
          const response = await chatService.sendMessage(conversationId, payload);
          
          // 替换临时消息并添加AI回复
          const { userMessage: savedUserMessage, aiMessage } = response.data;
          set((state) => ({
            messages: [
              ...state.messages.filter(msg => msg.id !== userMessage.id),
              savedUserMessage,
              aiMessage
            ]
          }));
          
          return response.data;
        } catch (error) {
          // 移除临时消息
          set((state) => ({
            messages: state.messages.filter(msg => !msg.isTemporary),
            error: error.message
          }));
          toast.error('发送消息失败');
          throw error;
        }
      },
      
      // 流式发送消息
      sendStreamMessage: async (conversationId, data) => {
        try {
          set({ isStreaming: true, error: null });
          
          // 添加用户消息
          const userMessage = {
            id: `user-${Date.now()}`,
            content: data.content,
            role: 'user',
            timestamp: new Date().toISOString()
          };
          
          // 添加AI消息占位符
          const aiMessage = {
            id: `ai-${Date.now()}`,
            content: '',
            role: 'assistant',
            timestamp: new Date().toISOString(),
            isStreaming: true
          };
          
          set((state) => ({
            messages: [...state.messages, userMessage, aiMessage]
          }));
          
          let fullContent = '';
          
          await chatService.sendStreamMessage(
            conversationId,
            data,
            // onMessage
            (chunk) => {
              if (chunk.content) {
                fullContent += chunk.content;
                set((state) => ({
                  messages: state.messages.map(msg => 
                    msg.id === aiMessage.id 
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                }));
              }
            },
            // onError
            (error) => {
              set((state) => ({
                messages: state.messages.filter(msg => msg.id !== aiMessage.id),
                error: error.message,
                isStreaming: false
              }));
              toast.error('流式消息发送失败');
            },
            // onComplete
            () => {
              set((state) => ({
                messages: state.messages.map(msg => 
                  msg.id === aiMessage.id 
                    ? { ...msg, isStreaming: false }
                    : msg
                ),
                isStreaming: false
              }));
            }
          );
          
        } catch (error) {
          set({ error: error.message, isStreaming: false });
          toast.error('发送流式消息失败');
          throw error;
        }
      },
      
      // 获取支持的模型
      fetchSupportedModels: async () => {
        // 检查认证状态
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || !authState.token) {
          console.warn('User not authenticated, cannot fetch models');
          set({ supportedModels: [], error: 'User not authenticated' });
          return [];
        }
        
        try {
          const response = await chatService.getSupportedModels();
          const models = Array.isArray(response.data) ? response.data : (response.data?.data || []);
          set({ supportedModels: models });
          return models;
        } catch (error) {
          console.error('Failed to fetch models:', error);
          set({ supportedModels: [], error: error.message });
          toast.error('获取模型列表失败，请检查网络连接');
          throw error;
        }
      },
      
      // 搜索对话
      searchConversations: async (query, filters = {}) => {
        try {
          set({ isLoading: true, error: null, searchQuery: query, filters });
          
          const response = await chatService.searchConversations(query, filters);
          
          set({
            conversations: response.data,
            conversationsPagination: {
              page: 1,
              limit: 20,
              total: response.pagination?.total || response.data.length,
              hasMore: false
            },
            isLoading: false
          });
          
          return response.data;
        } catch (error) {
          set({ error: error.message, isLoading: false });
          toast.error('搜索对话失败');
          throw error;
        }
      },
      
      // 清除搜索
      clearSearch: () => {
        set({ searchQuery: '', filters: { type: 'all', model: 'all', dateRange: 'all' } });
        get().fetchConversations(1, true);
      },
      
      // 重新生成回复
      regenerateResponse: async (messageId) => {
        try {
          set({ isLoading: true, error: null });
          
          const response = await chatService.regenerateResponse(messageId);
          
          set((state) => ({
            messages: state.messages.map(msg => 
              (msg.id === messageId || msg._id === messageId) ? response.data : msg
            ),
            isLoading: false
          }));
          
          toast.success('回复重新生成成功');
          return response.data;
        } catch (error) {
          set({ error: error.message, isLoading: false });
          toast.error('重新生成回复失败');
          throw error;
        }
      },
      
      // 标记消息
      markMessage: async (messageId, action) => {
        try {
          const response = await chatService.markMessage(messageId, action);
          
          set((state) => ({
            messages: state.messages.map(msg => 
              (msg.id === messageId || msg._id === messageId)
                ? { ...msg, marked: action }
                : msg
            )
          }));
          
          toast.success(`消息已${action === 'like' ? '点赞' : '点踩'}`);
          return response.data;
        } catch (error) {
          set({ error: error.message });
          toast.error('标记消息失败');
          throw error;
        }
      },
      
      // 批量删除对话
      deleteConversations: async (conversationIds) => {
        try {
          await chatService.deleteConversations(conversationIds);
          
          set((state) => ({
            conversations: state.conversations.filter(
              conv => !conversationIds.includes(conv.id ?? conv._id)
            ),
            currentConversation: conversationIds.includes(state.currentConversation?.id ?? state.currentConversation?._id)
              ? null
              : state.currentConversation,
            messages: conversationIds.includes(state.currentConversation?.id ?? state.currentConversation?._id) ? [] : state.messages
          }));
          
          toast.success(`已删除 ${conversationIds.length} 个对话`);
        } catch (error) {
          set({ error: error.message });
          toast.error('批量删除对话失败');
          throw error;
        }
      },
      
      // 导出对话
      exportConversation: async (conversationId, format = 'json') => {
        try {
          const blob = await chatService.exportConversation(conversationId, format);
          
          // 创建下载链接
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `conversation-${conversationId}.${format}`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          toast.success('对话导出成功');
        } catch (error) {
          set({ error: error.message });
          toast.error('导出对话失败');
          throw error;
        }
      },
      
      // 重置状态
      reset: () => {
        set({
          conversations: [],
          currentConversation: null,
          messages: [],
          isLoading: false,
          isStreaming: false,
          error: null,
          searchQuery: '',
          filters: { type: 'all', model: 'all', dateRange: 'all' },
          conversationsPagination: {
            page: 1,
            limit: 20,
            total: 0,
            hasMore: true
          },
          messagesPagination: {
            page: 1,
            limit: 50,
            total: 0,
            hasMore: true
          }
        });
      }
    }),
    {
      name: 'chat-store',
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversation: state.currentConversation,
        supportedModels: state.supportedModels,
        searchQuery: state.searchQuery,
        filters: state.filters
      })
    }
  )
);

export { useChatStore };
export default useChatStore;