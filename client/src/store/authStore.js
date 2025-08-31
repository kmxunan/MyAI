import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import authService from '../services/authService';
import toast from 'react-hot-toast';

const useAuthStore = create(
  persist(
    (set, get) => ({
      // 状态
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // 登录
      login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(credentials);
          const { user, tokens } = response.data.data;
          const token = tokens.accessToken;
          
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
          
          // 设置axios默认header
          authService.setAuthToken(token);
          
          toast.success('登录成功！');
          return response;
        } catch (error) {
          const errorMessage = error.response?.data?.message || '登录失败';
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage
          });
          toast.error(errorMessage);
          throw error;
        }
      },

      // 注册
      register: async (userData) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.register(userData);
          const { user, tokens } = response.data.data;
          const token = tokens.accessToken;
          
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
          
          // 设置axios默认header
          authService.setAuthToken(token);
          
          toast.success('注册成功！');
          return response;
        } catch (error) {
          const errorMessage = error.response?.data?.message || '注册失败';
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage
          });
          toast.error(errorMessage);
          throw error;
        }
      },

      // 登出
      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: null
        });
        
        // 清除axios默认header
        authService.removeAuthToken();
        
        toast.success('已退出登录');
      },

      // 更新用户信息
      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData }
        }));
      },

      // 清除错误
      clearError: () => {
        set({ error: null });
      },

      // 初始化认证状态
      initializeAuth: () => {
        const state = get();
        if (state.token) {
          authService.setAuthToken(state.token);
        }
      },

      // 验证token有效性
      validateToken: async () => {
        const state = get();
        if (!state.token) {
          set({ isLoading: false });
          return false;
        }
        
        set({ isLoading: true });
        try {
          const response = await authService.validateToken();
          if (response.data.valid) {
            set({ 
              user: response.data?.data?.user, 
              isAuthenticated: true,
              isLoading: false 
            });
            return true;
          } else {
            get().logout();
            return false;
          }
        } catch (error) {
          get().logout();
          return false;
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

export { useAuthStore };