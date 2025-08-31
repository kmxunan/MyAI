import axios from 'axios';

class AuthService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 增加到30秒以适应模型列表获取
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // 请求拦截器
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth-storage');
        if (token) {
          try {
            const authData = JSON.parse(token);
            if (authData.state?.token) {
              config.headers.Authorization = `Bearer ${authData.state.token}`;
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

    // 响应拦截器
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token过期或无效：只清理本地状态与默认头，交由上层路由守卫/页面逻辑处理跳转
          try {
            localStorage.removeItem('auth-storage');
          } catch {}
          delete this.api.defaults.headers.common['Authorization'];
        }
        return Promise.reject(error);
      }
    );
  }

  // 登录
  async login(credentials) {
    const response = await this.api.post('/auth/login', credentials);
    return response;
  }

  // 注册
  async register(userData) {
    const response = await this.api.post('/auth/register', userData);
    return response;
  }

  // 验证token
  async validateToken() {
    const response = await this.api.get('/auth/validate');
    return response;
  }

  // 获取用户信息
  async getUserProfile() {
    const response = await this.api.get('/auth/profile');
    return response;
  }

  // 更新用户信息
  async updateProfile(userData) {
    const response = await this.api.put('/auth/profile', userData);
    return response;
  }

  // 修改密码
  async changePassword(passwordData) {
    const response = await this.api.put('/auth/change-password', passwordData);
    return response;
  }

  // 忘记密码
  async forgotPassword(email) {
    const response = await this.api.post('/auth/forgot-password', { email });
    return response;
  }

  // 重置密码
  async resetPassword(token, newPassword) {
    const response = await this.api.post('/auth/reset-password', {
      token,
      newPassword
    });
    return response;
  }

  // 设置认证token
  setAuthToken(token) {
    if (token) {
      this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.api.defaults.headers.common['Authorization'];
    }
  }

  // 移除认证token
  removeAuthToken() {
    delete this.api.defaults.headers.common['Authorization'];
  }

  // 获取当前保存的token（供流式fetch等非axios场景使用）
  getToken() {
    try {
      const raw = localStorage.getItem('auth-storage');
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data?.state?.token || null;
    } catch (e) {
      return null;
    }
  }

  // 获取API实例（供其他服务使用）
  getApiInstance() {
    return this.api;
  }
}

const authService = new AuthService();
export default authService;