import React from 'react';
import { Box, Typography, Card, CardContent, Grid } from '@mui/material';
import { useAuthStore } from '../../store/authStore';

const SimpleDashboard = () => {
  const { user } = useAuthStore();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        欢迎，{user?.username || '用户'}！
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                用户信息
              </Typography>
              <Typography variant="body1">
                用户名: {user?.username}
              </Typography>
              <Typography variant="body1">
                邮箱: {user?.email}
              </Typography>
              <Typography variant="body1">
                角色: {user?.role}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                系统状态
              </Typography>
              <Typography variant="body1" color="success.main">
                ✅ 前端应用运行正常
              </Typography>
              <Typography variant="body1" color="success.main">
                ✅ 用户认证成功
              </Typography>
              <Typography variant="body1" color="success.main">
                ✅ 页面渲染正常
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default SimpleDashboard;