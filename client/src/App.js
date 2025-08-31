import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout/Layout';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import Dashboard from './pages/Dashboard/DashboardNoCharts';
import SmartChat from './pages/Chat/SmartChat';
import Business from './pages/Business/Business';
import SmartRAG from './pages/RAG/SmartRAG';
import FileUploadPage from './pages/FileUpload/FileUploadPage';
import Settings from './pages/Settings/Settings';
import Test from './pages/Test/Test';
import TestModels from './pages/TestModels';
import ProtectedRoute from './components/Auth/ProtectedRoute';

function App() {
  const { initializeAuth, validateToken } = useAuthStore();

  useEffect(() => {
    // 初始化认证状态
    initializeAuth();
    // 验证token有效性
    validateToken();
  }, [initializeAuth, validateToken]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Routes>
        {/* 公开路由 */}
        <Route 
          path="/login" 
          element={<Login />} 
        />
        <Route 
          path="/register" 
          element={<Register />} 
        />
        
        {/* 受保护的路由（嵌套路由 + Outlet 渲染） */}
        <Route 
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chat" element={<SmartChat />} />
          <Route path="/chat/:conversationId" element={<SmartChat />} />
          <Route path="/business" element={<Business />} />
          <Route path="/business/*" element={<Business />} />
          <Route path="/rag" element={<SmartRAG />} />
          <Route path="/rag/*" element={<SmartRAG />} />
          <Route path="/files" element={<FileUploadPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/test" element={<Test />} />
          <Route path="/test-models" element={<TestModels />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Box>
  );
}

export default App;