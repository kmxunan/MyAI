import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/**
 * 全局错误处理Hook
 * 提供统一的错误处理逻辑
 */
export const useErrorHandler = () => {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const handleError = useCallback((error, options = {}) => {
    const {
      showToast = true,
      redirectOnAuth = true,
      customMessage = null,
      logError = true
    } = options;

    // 记录错误
    if (logError) {
      console.error('Error handled by useErrorHandler:', error);
    }

    // 解析错误信息
    const errorInfo = parseError(error);
    
    // 处理认证错误
    if (errorInfo.isAuthError && redirectOnAuth) {
      handleAuthError();
      return;
    }

    // 显示错误提示
    if (showToast) {
      const message = customMessage || errorInfo.message;
      
      switch (errorInfo.type) {
        case 'validation':
          toast.error(message, {
            duration: 4000,
            icon: '⚠️'
          });
          break;
        case 'network':
          toast.error(message, {
            duration: 5000,
            icon: '🌐'
          });
          break;
        case 'server':
          toast.error(message, {
            duration: 6000,
            icon: '🔧'
          });
          break;
        default:
          toast.error(message, {
            duration: 4000
          });
      }
    }

    return errorInfo;
  }, [navigate, logout]);

  const handleAuthError = useCallback(() => {
    toast.error('登录已过期，请重新登录', {
      duration: 3000,
      icon: '🔐'
    });
    
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleAsyncError = useCallback(async (asyncFn, options = {}) => {
    try {
      return await asyncFn();
    } catch (error) {
      handleError(error, options);
      throw error; // 重新抛出错误，让调用者决定如何处理
    }
  }, [handleError]);

  const createErrorHandler = useCallback((options = {}) => {
    return (error) => handleError(error, options);
  }, [handleError]);

  return {
    handleError,
    handleAuthError,
    handleAsyncError,
    createErrorHandler
  };
};

/**
 * 解析错误对象，提取有用信息
 */
const parseError = (error) => {
  const result = {
    message: '发生未知错误',
    type: 'unknown',
    statusCode: null,
    isAuthError: false,
    isNetworkError: false,
    details: null
  };

  // 处理 Axios 错误
  if (error?.response) {
    const { status, data } = error.response;
    result.statusCode = status;
    
    // 认证错误
    if (status === 401) {
      result.isAuthError = true;
      result.type = 'auth';
      result.message = data?.message || '认证失败，请重新登录';
    }
    // 权限错误
    else if (status === 403) {
      result.type = 'permission';
      result.message = data?.message || '权限不足，无法执行此操作';
    }
    // 验证错误
    else if (status === 400) {
      result.type = 'validation';
      result.message = data?.message || '请求参数错误';
      result.details = data?.errors || data?.details;
    }
    // 资源未找到
    else if (status === 404) {
      result.type = 'notfound';
      result.message = data?.message || '请求的资源不存在';
    }
    // 冲突错误
    else if (status === 409) {
      result.type = 'conflict';
      result.message = data?.message || '资源冲突，请检查后重试';
    }
    // 限流错误
    else if (status === 429) {
      result.type = 'ratelimit';
      result.message = data?.message || '请求过于频繁，请稍后重试';
    }
    // 服务器错误
    else if (status >= 500) {
      result.type = 'server';
      result.message = data?.message || '服务器内部错误，请稍后重试';
    }
    // 其他HTTP错误
    else {
      result.type = 'http';
      result.message = data?.message || `HTTP错误: ${status}`;
    }
  }
  // 网络错误
  else if (error?.request) {
    result.isNetworkError = true;
    result.type = 'network';
    result.message = '网络连接失败，请检查网络设置';
  }
  // JavaScript 错误
  else if (error instanceof Error) {
    result.type = 'javascript';
    result.message = error.message || '应用程序错误';
  }
  // 字符串错误
  else if (typeof error === 'string') {
    result.message = error;
  }
  // 其他类型错误
  else if (error?.message) {
    result.message = error.message;
  }

  return result;
};

/**
 * 错误重试Hook
 */
export const useRetry = (maxRetries = 3, delay = 1000) => {
  const { handleError } = useErrorHandler();

  const retry = useCallback(async (asyncFn, options = {}) => {
    const { 
      retries = maxRetries, 
      retryDelay = delay,
      shouldRetry = (error) => {
        // 默认只重试网络错误和5xx服务器错误
        const errorInfo = parseError(error);
        return errorInfo.isNetworkError || 
               (errorInfo.statusCode && errorInfo.statusCode >= 500);
      }
    } = options;

    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await asyncFn();
      } catch (error) {
        lastError = error;
        
        // 如果是最后一次尝试或不应该重试，则抛出错误
        if (attempt === retries || !shouldRetry(error)) {
          throw error;
        }
        
        // 等待后重试
        if (retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
        }
        
        console.log(`Retrying (${attempt + 1}/${retries})...`);
      }
    }
    
    throw lastError;
  }, [maxRetries, delay, handleError]);

  return { retry };
};

/**
 * 错误边界Hook (用于函数组件)
 */
export const useErrorBoundary = () => {
  const { handleError } = useErrorHandler();

  const captureError = useCallback((error, errorInfo = {}) => {
    // 记录错误到控制台
    console.error('Error captured by useErrorBoundary:', error, errorInfo);
    
    // 处理错误
    handleError(error, {
      showToast: true,
      logError: false // 已经在这里记录了
    });
    
    // 可以在这里发送错误报告到监控服务
    reportErrorToService(error, errorInfo);
  }, [handleError]);

  return { captureError };
};

/**
 * 发送错误报告到监控服务
 */
const reportErrorToService = (error, errorInfo) => {
  try {
    const errorData = {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: localStorage.getItem('userId'),
      ...errorInfo
    };
    
    // 这里可以调用API发送错误报告
    // 例如: errorReportingService.report(errorData);
    console.log('Error reported:', errorData);
  } catch (reportError) {
    console.error('Failed to report error:', reportError);
  }
};