import React, { useState, useEffect } from 'react';
import { chatService } from '../services/chatService';

const TestModels = () => {
  const [models, setModels] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        console.log('开始获取模型列表...');
        const response = await chatService.getCategorizedModels();
        console.log('模型API响应:', response);
        setModels(response);
      } catch (err) {
        console.error('获取模型失败:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>模型测试页面</h1>
      <pre>{JSON.stringify(models, null, 2)}</pre>
    </div>
  );
};

export default TestModels;