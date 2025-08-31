/**
 * 客户端配置管理模块
 * 统一管理所有环境变量和配置项
 */

// 配置类型转换工具
const getEnvString = (key, defaultValue = '') => {
  return process.env[key] || defaultValue;
};

const getEnvNumber = (key, defaultValue = 0) => {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
};

const getEnvBoolean = (key, defaultValue = false) => {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
};

const getEnvArray = (key, defaultValue = []) => {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

// 主配置对象
const config = {
  // 应用基础配置
  app: {
    name: getEnvString('REACT_APP_NAME', 'MyAI'),
    version: getEnvString('REACT_APP_VERSION', '1.0.0'),
    description: getEnvString('REACT_APP_DESCRIPTION', 'AI-powered application'),
    env: getEnvString('NODE_ENV', 'development'),
    debug: getEnvBoolean('REACT_APP_DEBUG', false),
    publicUrl: getEnvString('PUBLIC_URL', ''),
  },

  // API服务配置
  api: {
    // 主服务器API
    baseUrl: getEnvString('REACT_APP_API_URL', 'http://localhost:3001'),
    timeout: getEnvNumber('REACT_APP_API_TIMEOUT', 30000),
    retryAttempts: getEnvNumber('REACT_APP_API_RETRY_ATTEMPTS', 3),
    retryDelay: getEnvNumber('REACT_APP_API_RETRY_DELAY', 1000),
    
    // RAG服务API
    ragUrl: getEnvString('REACT_APP_RAG_URL', 'http://localhost:3002'),
    ragTimeout: getEnvNumber('REACT_APP_RAG_TIMEOUT', 30000),
    
    // WebSocket配置
    wsUrl: getEnvString('REACT_APP_WS_URL', 'ws://localhost:3001'),
    wsReconnectAttempts: getEnvNumber('REACT_APP_WS_RECONNECT_ATTEMPTS', 5),
    wsReconnectDelay: getEnvNumber('REACT_APP_WS_RECONNECT_DELAY', 3000),
  },

  // 认证配置
  auth: {
    tokenKey: getEnvString('REACT_APP_TOKEN_KEY', 'auth-storage'),
    refreshTokenKey: getEnvString('REACT_APP_REFRESH_TOKEN_KEY', 'refresh-token'),
    tokenExpiry: getEnvNumber('REACT_APP_TOKEN_EXPIRY', 24 * 60 * 60 * 1000), // 24小时
    autoRefresh: getEnvBoolean('REACT_APP_AUTO_REFRESH', true),
    rememberMe: getEnvBoolean('REACT_APP_REMEMBER_ME', true),
  },

  // UI配置
  ui: {
    theme: getEnvString('REACT_APP_THEME', 'light'),
    language: getEnvString('REACT_APP_LANGUAGE', 'zh-CN'),
    pageSize: getEnvNumber('REACT_APP_PAGE_SIZE', 20),
    maxPageSize: getEnvNumber('REACT_APP_MAX_PAGE_SIZE', 100),
    animationDuration: getEnvNumber('REACT_APP_ANIMATION_DURATION', 300),
    toastDuration: getEnvNumber('REACT_APP_TOAST_DURATION', 3000),
  },

  // 文件上传配置
  upload: {
    maxFileSize: getEnvNumber('REACT_APP_MAX_FILE_SIZE', 10 * 1024 * 1024), // 10MB
    allowedTypes: getEnvArray('REACT_APP_ALLOWED_FILE_TYPES', [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/markdown',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]),
    chunkSize: getEnvNumber('REACT_APP_UPLOAD_CHUNK_SIZE', 1024 * 1024), // 1MB
    maxConcurrent: getEnvNumber('REACT_APP_MAX_CONCURRENT_UPLOADS', 3),
  },

  // AI配置
  ai: {
    defaultModel: getEnvString('REACT_APP_DEFAULT_AI_MODEL', 'openai/gpt-3.5-turbo'),
    defaultTemperature: getEnvNumber('REACT_APP_DEFAULT_TEMPERATURE', 0.7),
    defaultMaxTokens: getEnvNumber('REACT_APP_DEFAULT_MAX_TOKENS', 2048),
    streamResponse: getEnvBoolean('REACT_APP_STREAM_RESPONSE', true),
    enableRAG: getEnvBoolean('REACT_APP_ENABLE_RAG', true),
    ragMaxResults: getEnvNumber('REACT_APP_RAG_MAX_RESULTS', 5),
    ragSimilarityThreshold: getEnvNumber('REACT_APP_RAG_SIMILARITY_THRESHOLD', 0.7),
  },

  // 聊天配置
  chat: {
    maxMessages: getEnvNumber('REACT_APP_MAX_CHAT_MESSAGES', 100),
    autoSave: getEnvBoolean('REACT_APP_CHAT_AUTO_SAVE', true),
    saveInterval: getEnvNumber('REACT_APP_CHAT_SAVE_INTERVAL', 30000), // 30秒
    typingIndicator: getEnvBoolean('REACT_APP_TYPING_INDICATOR', true),
    messageRetention: getEnvNumber('REACT_APP_MESSAGE_RETENTION', 30), // 30天
  },

  // 缓存配置
  cache: {
    enabled: getEnvBoolean('REACT_APP_CACHE_ENABLED', true),
    ttl: getEnvNumber('REACT_APP_CACHE_TTL', 5 * 60 * 1000), // 5分钟
    maxSize: getEnvNumber('REACT_APP_CACHE_MAX_SIZE', 100),
    storageType: getEnvString('REACT_APP_CACHE_STORAGE', 'localStorage'), // localStorage, sessionStorage, memory
  },

  // 性能配置
  performance: {
    enableLazyLoading: getEnvBoolean('REACT_APP_LAZY_LOADING', true),
    enableVirtualization: getEnvBoolean('REACT_APP_VIRTUALIZATION', true),
    debounceDelay: getEnvNumber('REACT_APP_DEBOUNCE_DELAY', 300),
    throttleDelay: getEnvNumber('REACT_APP_THROTTLE_DELAY', 100),
    maxConcurrentRequests: getEnvNumber('REACT_APP_MAX_CONCURRENT_REQUESTS', 6),
  },

  // 安全配置
  security: {
    enableCSP: getEnvBoolean('REACT_APP_ENABLE_CSP', true),
    enableXSRF: getEnvBoolean('REACT_APP_ENABLE_XSRF', true),
    sanitizeInput: getEnvBoolean('REACT_APP_SANITIZE_INPUT', true),
    maxLoginAttempts: getEnvNumber('REACT_APP_MAX_LOGIN_ATTEMPTS', 5),
    lockoutDuration: getEnvNumber('REACT_APP_LOCKOUT_DURATION', 15 * 60 * 1000), // 15分钟
  },

  // 监控和分析配置
  monitoring: {
    enableAnalytics: getEnvBoolean('REACT_APP_ENABLE_ANALYTICS', false),
    enableErrorReporting: getEnvBoolean('REACT_APP_ENABLE_ERROR_REPORTING', true),
    enablePerformanceMonitoring: getEnvBoolean('REACT_APP_ENABLE_PERFORMANCE_MONITORING', false),
    analyticsId: getEnvString('REACT_APP_ANALYTICS_ID', ''),
    errorReportingDsn: getEnvString('REACT_APP_ERROR_REPORTING_DSN', ''),
  },

  // 开发配置
  development: {
    enableDevTools: getEnvBoolean('REACT_APP_ENABLE_DEV_TOOLS', config.app?.env === 'development'),
    enableMockData: getEnvBoolean('REACT_APP_ENABLE_MOCK_DATA', false),
    enableHotReload: getEnvBoolean('REACT_APP_ENABLE_HOT_RELOAD', true),
    logLevel: getEnvString('REACT_APP_LOG_LEVEL', 'info'), // error, warn, info, debug
    showReduxDevTools: getEnvBoolean('REACT_APP_SHOW_REDUX_DEVTOOLS', config.app?.env === 'development'),
  },

  // 第三方服务配置
  services: {
    // 地图服务
    mapApiKey: getEnvString('REACT_APP_MAP_API_KEY', ''),
    mapProvider: getEnvString('REACT_APP_MAP_PROVIDER', 'google'), // google, baidu, amap
    
    // 支付服务
    paymentProvider: getEnvString('REACT_APP_PAYMENT_PROVIDER', 'stripe'),
    stripePublicKey: getEnvString('REACT_APP_STRIPE_PUBLIC_KEY', ''),
    
    // 社交登录
    googleClientId: getEnvString('REACT_APP_GOOGLE_CLIENT_ID', ''),
    githubClientId: getEnvString('REACT_APP_GITHUB_CLIENT_ID', ''),
    wechatAppId: getEnvString('REACT_APP_WECHAT_APP_ID', ''),
  },
};

// 配置验证函数
const validateConfig = () => {
  const errors = [];
  
  // 验证必需的配置项
  if (!config.api.baseUrl) {
    errors.push('API base URL is required');
  }
  
  if (config.upload.maxFileSize <= 0) {
    errors.push('Upload max file size must be greater than 0');
  }
  
  if (config.ai.defaultTemperature < 0 || config.ai.defaultTemperature > 2) {
    errors.push('AI temperature must be between 0 and 2');
  }
  
  if (config.ai.defaultMaxTokens <= 0) {
    errors.push('AI max tokens must be greater than 0');
  }
  
  if (errors.length > 0) {
    console.error('Configuration validation errors:', errors);
    if (config.app.env === 'production') {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }
  
  return errors.length === 0;
};

// 获取API端点URL的辅助函数
const getApiUrl = (path = '') => {
  const baseUrl = config.api.baseUrl.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl;
};

const getRagApiUrl = (path = '') => {
  const baseUrl = config.api.ragUrl.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return cleanPath ? `${baseUrl}/api/v1/${cleanPath}` : `${baseUrl}/api/v1`;
};

// 获取WebSocket URL的辅助函数
const getWsUrl = (path = '') => {
  const baseUrl = config.api.wsUrl.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl;
};

// 配置管理器
const configManager = {
  // 获取配置值
  get: (path, defaultValue = undefined) => {
    const keys = path.split('.');
    let value = config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  },
  
  // 检查配置是否存在
  has: (path) => {
    return configManager.get(path) !== undefined;
  },
  
  // 获取所有配置（用于调试）
  getAll: () => {
    if (config.app.env === 'development') {
      return { ...config };
    }
    // 生产环境下隐藏敏感信息
    const safeConfig = { ...config };
    if (safeConfig.services) {
      Object.keys(safeConfig.services).forEach(key => {
        if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
          safeConfig.services[key] = '***';
        }
      });
    }
    return safeConfig;
  },
  
  // 验证配置
  validate: validateConfig,
  
  // 获取环境信息
  getEnvironment: () => ({
    name: config.app.env,
    isDevelopment: config.app.env === 'development',
    isProduction: config.app.env === 'production',
    isTest: config.app.env === 'test',
  }),
};

// 初始化时验证配置
if (config.app.env !== 'test') {
  validateConfig();
}

// 开发环境下输出配置信息
if (config.development.enableDevTools && config.app.env === 'development') {
  console.log('🔧 Client Configuration:', configManager.getAll());
}

export {
  config,
  configManager,
  getApiUrl,
  getRagApiUrl,
  getWsUrl,
  validateConfig,
};

export default config;