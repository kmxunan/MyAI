import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import authService from './authService';

// 默认设置
const defaultSettings = {
  theme: 'light',
  language: 'zh-CN',
  notifications: {
    email: true,
    push: false,
    sms: false
  },
  privacy: {
    profileVisible: true,
    activityVisible: false,
    dataCollection: true
  },
  ai: {
    defaultModel: 'openai/gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 2048,
    streamResponse: true
  }
};

// 设置存储
export const useSettingsStore = create(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      isLoading: false,
      error: null,

      // 加载设置
      loadSettings: async () => {
        set({ isLoading: true, error: null });
        try {
          const token = authService.getToken();
          if (!token) {
            throw new Error('用户未登录');
          }

          const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
          const response = await fetch(`${baseURL}/api/user/settings`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error('获取设置失败');
          }

          const data = await response.json();
          set({ settings: data.data || defaultSettings, isLoading: false });
        } catch (error) {
          console.error('加载设置失败:', error);
          set({ error: error.message, isLoading: false });
        }
      },

      // 更新设置
      updateSettings: async (newSettings) => {
        set({ isLoading: true, error: null });
        try {
          const token = authService.getToken();
          if (!token) {
            throw new Error('用户未登录');
          }

          const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
          const response = await fetch(`${baseURL}/api/user/settings`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(newSettings)
          });

          if (!response.ok) {
            throw new Error('更新设置失败');
          }

          const data = await response.json();
          set({ settings: data.data, isLoading: false });
        } catch (error) {
          console.warn('更新设置失败，已本地回退:', error);
          // 本地回退合并（深合并常见分组）
          const current = get().settings || defaultSettings;
          const merged = {
            ...current,
            ...newSettings,
            ...(newSettings.ai ? { ai: { ...current.ai, ...newSettings.ai } } : {}),
            ...(newSettings.notifications ? { notifications: { ...current.notifications, ...newSettings.notifications } } : {}),
            ...(newSettings.privacy ? { privacy: { ...current.privacy, ...newSettings.privacy } } : {})
          };
          set({ settings: merged, isLoading: false, error: error.message });
        }
      },

      // 重置设置
      resetSettings: async () => {
        set({ isLoading: true, error: null });
        try {
          const token = authService.getToken();
          if (!token) {
            throw new Error('用户未登录');
          }

          const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
          const response = await fetch(`${baseURL}/api/user/settings/reset`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error('重置设置失败');
          }

          const data = await response.json();
          set({ settings: data.data, isLoading: false });
        } catch (error) {
          console.warn('重置设置失败，已本地回退为默认:', error);
          set({ settings: defaultSettings, isLoading: false, error: error.message });
        }
      },

      // 清除错误
      clearError: () => set({ error: null })
    }),
    {
      name: 'settings-storage',
      partialize: (state) => ({ settings: state.settings })
    }
  )
);

// 设置服务类
class SettingsService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
  }

  // 获取AI默认模型
  getDefaultModel() {
    const { settings } = useSettingsStore.getState();
    return settings.ai.defaultModel;
  }

  // 设置AI默认模型
  async setDefaultModel(model) {
    const { updateSettings } = useSettingsStore.getState();
    await updateSettings({
      ai: {
        ...useSettingsStore.getState().settings.ai,
        defaultModel: model
      }
    });
  }

  // 获取AI设置
  getAISettings() {
    const { settings } = useSettingsStore.getState();
    return settings.ai;
  }

  // 更新AI设置
  async updateAISettings(aiSettings) {
    const { updateSettings } = useSettingsStore.getState();
    await updateSettings({
      ai: {
        ...useSettingsStore.getState().settings.ai,
        ...aiSettings
      }
    });
  }
}

export const settingsService = new SettingsService();
export { defaultSettings };