import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuthStore } from '../../store/authStore';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, token, validateToken, initializeAuth } = useAuthStore();
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      // 初始化认证状态
      initializeAuth();
      
      // 如果没有token，直接结束验证
      if (!token) {
        setIsValidating(false);
        return;
      }
      
      // 有token时进行验证
      try {
        await validateToken();
        // 无论验证结果如何，都结束loading状态
        setIsValidating(false);
      } catch (error) {
        // 验证失败，结束loading状态
        console.error('Token validation failed:', error);
        setIsValidating(false);
      }
    };

    checkAuth();
  }, [token, validateToken, initializeAuth]);

  // 正在验证token
  if (isValidating) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 2
        }}
      >
        <CircularProgress size={40} />
        <Typography variant="body1" color="text.secondary">
          正在验证身份...
        </Typography>
      </Box>
    );
  }

  // 未认证，重定向到登录页
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 已认证，渲染子组件
  return children;
};

export default ProtectedRoute;