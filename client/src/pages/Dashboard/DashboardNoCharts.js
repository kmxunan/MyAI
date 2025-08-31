import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Avatar,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  IconButton,
  Paper
} from '@mui/material';
import {
  Chat,
  Business,
  Description,
  AccessTime,
  MoreVert,
  Add,
  Speed,
  Memory,
  CloudQueue
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import businessService from '../../services/businessService';
import { toast } from 'react-hot-toast';

const recentActivities = [
  {
    id: 1,
    type: 'chat',
    title: '智能对话会话',
    description: '与GPT-4进行了30分钟的技术讨论',
    time: '2小时前',
    icon: <Chat />,
    color: '#1976d2'
  },
  {
    id: 2,
    type: 'business',
    title: '商业分析报告',
    description: '生成了Q4季度市场分析报告',
    time: '4小时前',
    icon: <Business />,
    color: '#388e3c'
  },
  {
    id: 3,
    type: 'rag',
    title: 'RAG文档查询',
    description: '查询了产品技术文档',
    time: '6小时前',
    icon: <Description />,
    color: '#f57c00'
  }
];

const Dashboard = () => {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalChats: 0,
    totalTokens: 0,
    activeModels: 0,
    successRate: 0
  });

  useEffect(() => {
    // 等待认证验证完成，且用户已认证才发起请求
    if (isLoading || !isAuthenticated) return;
    // 加载真实统计数据
    const loadStats = async () => {
      try {
        const data = await businessService.getDashboardStats();
        setStats(data);
      } catch (error) {
        console.error('Failed to load dashboard stats:', error);
        toast.error('加载统计数据失败');
        // 使用默认数据作为后备
        setStats({
          totalChats: 0,
          totalTokens: 0,
          activeModels: 0,
          successRate: 0
        });
      }
    };

    loadStats();
  }, [isAuthenticated, isLoading]);

  const StatCard = ({ title, value, subtitle, icon, color, progress }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Avatar sx={{ bgcolor: color, mr: 2 }}>
            {icon}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4" component="div">
              {value}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
          </Box>
        </Box>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {subtitle}
          </Typography>
        )}
        {progress !== undefined && (
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 6, borderRadius: 3 }}
          />
        )}
      </CardContent>
    </Card>
  );

  const QuickActionCard = ({ title, description, icon, color, onClick }) => (
    <Card 
      sx={{ 
        height: '100%', 
        cursor: 'pointer',
        transition: 'transform 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3
        }
      }}
      onClick={onClick}
    >
      <CardContent sx={{ textAlign: 'center', py: 3 }}>
        <Avatar sx={{ bgcolor: color, mx: 'auto', mb: 2, width: 56, height: 56 }}>
          {icon}
        </Avatar>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </CardContent>
    </Card>
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* 欢迎区域 */}
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Typography variant="h4" gutterBottom>
          欢迎回来，{user?.username}！
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.9 }}>
          今天是美好的一天，让我们开始您的AI之旅吧
        </Typography>
      </Paper>

      {/* 统计卡片 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="总对话数"
            value={stats.totalChats}
            subtitle="本月增长 +12%"
            icon={<Chat />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Token使用量"
            value={`${(stats.totalTokens / 1000).toFixed(1)}K`}
            subtitle="剩余额度 85%"
            icon={<Memory />}
            color="#388e3c"
            progress={85}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="活跃模型"
            value={stats.activeModels}
            subtitle="支持多种AI模型"
            icon={<CloudQueue />}
            color="#f57c00"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="成功率"
            value={`${stats.successRate}%`}
            subtitle="系统运行稳定"
            icon={<Speed />}
            color="#7b1fa2"
            progress={stats.successRate}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* 快速操作 */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ height: 400 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                快速操作
              </Typography>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <QuickActionCard
                    title="智能对话"
                    description="开始新的AI对话"
                    icon={<Chat />}
                    color="#1976d2"
                    onClick={() => navigate('/chat')}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <QuickActionCard
                    title="商业助手"
                    description="商业分析和建议"
                    icon={<Business />}
                    color="#388e3c"
                    onClick={() => navigate('/business')}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <QuickActionCard
                    title="RAG问答"
                    description="文档智能问答"
                    icon={<Description />}
                    color="#f57c00"
                    onClick={() => navigate('/rag')}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <QuickActionCard
                    title="文件处理"
                    description="上传和处理文件"
                    icon={<Add />}
                    color="#7b1fa2"
                    onClick={() => navigate('/files')}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* 最近活动 */}
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: 400 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  最近活动
                </Typography>
                <IconButton size="small">
                  <MoreVert />
                </IconButton>
              </Box>
              <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                {recentActivities.map((activity) => (
                  <ListItem key={activity.id} sx={{ px: 0 }}>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: activity.color, width: 40, height: 40 }}>
                        {activity.icon}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={activity.title}
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary" component="span">
                            {activity.description}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                            <AccessTime sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary" component="span">
                              {activity.time}
                            </Typography>
                          </Box>
                        </Box>
                      }
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;