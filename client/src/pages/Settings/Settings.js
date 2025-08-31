import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  // CardSection,
  Typography,
  // Button,
  TextField,
  Switch,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Alert,
  Tabs,
  Tab,
  Paper,
  Avatar,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  // CircularProgress
} from '@mui/material';
import {
  Person,
  Security,
  Notifications,
  Palette,
  Api,
  Edit,
  Save,
  Cancel,
  Delete,
  Add,
  CloudUpload,
  CheckCircle,
  Error
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { chatService } from '../../services/chatService';
import { useSettingsStore } from '../../services/settingsService';
import toast from 'react-hot-toast';
import ActionButton from '../../components/common/ActionButton';
import CardSection from '../../components/common/CardSection';
import { defaultSettings } from '../../services/settingsService';

const Settings = () => {
  const { user, updateUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    avatar: user?.avatar || '',
    bio: user?.bio || ''
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  // 使用设置存储
  const {
    settings,
    loadSettings,
    updateSettings,
    isLoading
  } = useSettingsStore();
  
  // 提交加载态
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [addingApi, setAddingApi] = useState(false);
  
  const [apiKeys, setApiKeys] = useState([
    {
      id: 1,
      name: 'OpenRouter API',
      key: 'sk-or-v1-*********************',
      status: 'active',
      lastUsed: '2024-01-15 14:30:00',
      usage: 85
    },
    {
      id: 2,
      name: 'Custom API',
      key: 'custom-*********************',
      status: 'inactive',
      lastUsed: '2024-01-10 09:15:00',
      usage: 12
    }
  ]);
  const [apiFilter, setApiFilter] = useState('');
  const [showApiDialog, setShowApiDialog] = useState(false);
  const [newApiKey, setNewApiKey] = useState({ name: '', key: '' });
  const [availableModels, setAvailableModels] = useState({
    chat: [],
    code: [],
    image: [],
    embedding: [],
    reasoning: [],
    creative: [],
    other: []
  });
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('chat');
  const [modelSearchTerm, setModelSearchTerm] = useState('');

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        email: user.email || '',
        avatar: user.avatar || '',
        bio: user.bio || ''
      });
    }
  }, [user]);

  // 加载用户设置
  useEffect(() => {
    const initializeSettings = async () => {
      try {
        await loadSettings();
      } catch (error) {
        console.error('加载设置失败:', error);
      }
    };
    
    if (user) {
      initializeSettings();
    }
  }, [user, loadSettings]);

  // 获取可用模型列表
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setModelsLoading(true);
        const response = await chatService.getCategorizedModels();
        if (response.success) {
          setAvailableModels(response.data);
        }
      } catch (error) {
        console.error('获取模型列表失败:', error);
        toast.error('获取模型列表失败');
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, []);
  
  const handleProfileSave = async () => {
    try {
      setSavingProfile(true);
      await updateUser(formData);
      setIsEditing(false);
      toast.success('个人信息更新成功！');
    } catch (error) {
      toast.error('更新失败，请重试');
    } finally {
      setSavingProfile(false);
    }
  };
  
  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('新密码和确认密码不匹配');
      return;
    }
    
    if (passwordData.newPassword.length < 8) {
      toast.error('密码长度至少8位');
      return;
    }
    
    try {
      setChangingPassword(true);
      // 这里应该调用修改密码的API
      await new Promise(r => setTimeout(r, 800));
      toast.success('密码修改成功！');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error('密码修改失败，请重试');
    } finally {
      setChangingPassword(false);
    }
  };
  
  const handleSettingChange = async (category, key, value) => {
    try {
      // 支持顶层与分组设置
      let newSettings;
      if (!category) {
        newSettings = { [key]: value };
      } else {
        newSettings = {
          [category]: {
            ...settings[category],
            [key]: value
          }
        };
      }
      await updateSettings(newSettings);
      toast.success('设置已保存');
    } catch (error) {
      toast.error('设置保存失败');
    }
  };

  // 获取过滤后的模型列表
  const getFilteredModels = () => {
    const categoryModels = availableModels[selectedCategory] || [];
    if (!modelSearchTerm) {
      return categoryModels;
    }
    return categoryModels.filter(model => 
      model.name.toLowerCase().includes(modelSearchTerm.toLowerCase()) ||
      model.id.toLowerCase().includes(modelSearchTerm.toLowerCase())
    );
  };
  
  const handleAddApiKey = () => {
    if (!newApiKey.name || !newApiKey.key) {
      toast.error('请填写完整信息');
      return;
    }
    
    const newKey = {
      id: Date.now(),
      name: newApiKey.name,
      key: newApiKey.key.substring(0, 20) + '*********************',
      status: 'active',
      lastUsed: '从未使用',
      usage: 0
    };
    
    setAddingApi(true);
    setTimeout(() => {
      setApiKeys(prev => [...prev, newKey]);
      setNewApiKey({ name: '', key: '' });
      setShowApiDialog(false);
      setAddingApi(false);
      toast.success('API密钥添加成功！');
    }, 400);
  };
  
  const handleDeleteApiKey = (id) => {
    setApiKeys(prev => prev.filter(key => key.id !== id));
    toast.success('API密钥删除成功！');
  };
  
  const getStatusChip = (status) => {
    switch (status) {
      case 'active':
        return <Chip label="活跃" color="success" size="small" icon={<CheckCircle />} />;
      case 'inactive':
        return <Chip label="未激活" color="default" size="small" />;
      case 'error':
        return <Chip label="错误" color="error" size="small" icon={<Error />} />;
      default:
        return <Chip label="未知" size="small" />;
    }
  };
  
  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* 页面头部 */}
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Typography variant="h4" gutterBottom>
          系统设置
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.9 }}>
          管理您的账户、偏好设置和系统配置
        </Typography>
      </Paper>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={(e, newValue) => setActiveTab(newValue)}
          textColor="primary"
          indicatorColor="primary"
          sx={{
            '& .MuiTabs-indicator': { height: 3, borderRadius: 2 },
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, borderRadius: 1 },
          }}
        >
          <Tab icon={<Person />} label="个人资料" />
          <Tab icon={<Security />} label="安全设置" />
          <Tab icon={<Notifications />} label="通知设置" />
          <Tab icon={<Palette />} label="界面设置" />
          <Tab icon={<Api />} label="API管理" />
        </Tabs>
      </Box>
      
      {/* 个人资料 */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Avatar
                  sx={{ width: 120, height: 120, mx: 'auto', mb: 2 }}
                  src={formData.avatar}
                >
                  {formData.username?.charAt(0)?.toUpperCase()}
                </Avatar>
                <Typography variant="h6" gutterBottom>
                  {formData.username}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {formData.email}
                </Typography>
                <ActionButton
                  variant="outlined"
                  startIcon={<CloudUpload />}
                  sx={{ mt: 2 }}
                >
                  更换头像
                </ActionButton>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={8}>
            <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="h6">
                    基本信息
                  </Typography>
                  {!isEditing ? (
                    <ActionButton
                      startIcon={<Edit />}
                      onClick={() => setIsEditing(true)}
                      variant="text"
                    >
                      编辑
                    </ActionButton>
                  ) : (
                    <Box>
                      <ActionButton
                        startIcon={<Cancel />}
                        onClick={() => {
                          setIsEditing(false);
                          setFormData({
                            username: user?.username || '',
                            email: user?.email || '',
                            avatar: user?.avatar || '',
                            bio: user?.bio || ''
                          });
                        }}
                        sx={{ mr: 1 }}
                        variant="text"
                      >
                        取消
                      </ActionButton>
                      <ActionButton
                        loading={savingProfile}
                        startIcon={<Save />}
                        onClick={handleProfileSave}
                      >
                        保存
                      </ActionButton>
                    </Box>
                  )}
                </Box>
                
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="用户名"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      disabled={!isEditing}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="邮箱"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      disabled={!isEditing}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="个人简介"
                      multiline
                      rows={4}
                      value={formData.bio}
                      onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="介绍一下自己..."
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      
      {/* 安全设置 */}
      {activeTab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <CardSection title="修改密码">
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="当前密码"
                    type={showPassword ? 'text' : 'password'}
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="新密码"
                    type={showPassword ? 'text' : 'password'}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="确认新密码"
                    type={showPassword ? 'text' : 'password'}
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={showPassword}
                        onChange={(e) => setShowPassword(e.target.checked)}
                      />
                    }
                    label="显示密码"
                  />
                </Grid>
                <Grid item xs={12}>
                  <ActionButton
                    variant="contained"
                    onClick={handlePasswordChange}
                    loading={changingPassword}
                    disabled={!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                    startIcon={<Security />}
                  >
                    修改密码
                  </ActionButton>
                </Grid>
              </Grid>
            </CardSection>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <CardSection title="隐私设置">
              <List>
                <ListItem>
                  <ListItemText
                    primary="公开个人资料"
                    secondary="允许其他用户查看您的基本信息"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.privacy.profileVisible}
                      onChange={(e) => handleSettingChange('privacy', 'profileVisible', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="显示活动状态"
                    secondary="显示您的在线状态和最后活动时间"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.privacy.activityVisible}
                      onChange={(e) => handleSettingChange('privacy', 'activityVisible', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="数据收集"
                    secondary="允许收集使用数据以改善服务"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.privacy.dataCollection}
                      onChange={(e) => handleSettingChange('privacy', 'dataCollection', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
            </CardSection>
          </Grid>
        </Grid>
      )}
      
      {/* 通知设置 */}
      {activeTab === 2 && (
        <CardSection title="通知偏好">
          <List>
            <ListItem>
              <ListItemText
                primary="邮件通知"
                secondary="接收重要更新和系统通知"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.notifications.email}
                  onChange={(e) => handleSettingChange('notifications', 'email', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem>
              <ListItemText
                primary="推送通知"
                secondary="浏览器推送通知"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.notifications.push}
                  onChange={(e) => handleSettingChange('notifications', 'push', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <ListItem>
              <ListItemText
                primary="短信通知"
                secondary="重要安全提醒"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.notifications.sms}
                  onChange={(e) => handleSettingChange('notifications', 'sms', e.target.checked)}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </CardSection>
      )}
      
      {/* 界面设置 */}
      {activeTab === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <CardSection title="外观设置">
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>主题</InputLabel>
                    <Select
                      value={settings.theme}
                      onChange={(e) => handleSettingChange('', 'theme', e.target.value)}
                    >
                      <MenuItem value="light">浅色主题</MenuItem>
                      <MenuItem value="dark">深色主题</MenuItem>
                      <MenuItem value="auto">跟随系统</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>语言</InputLabel>
                    <Select
                      value={settings.language}
                      onChange={(e) => handleSettingChange('', 'language', e.target.value)}
                    >
                      <MenuItem value="zh-CN">简体中文</MenuItem>
                      <MenuItem value="en-US">English</MenuItem>
                      <MenuItem value="ja-JP">日本語</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </CardSection>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <CardSection title="AI设置" headerActions={
              <ActionButton
                variant="outlined"
                color="primary"
                onClick={async () => {
                  try {
                    await updateSettings({ ai: defaultSettings.ai });
                    toast.success('AI设置已恢复默认');
                  } catch (e) {
                    toast.error('恢复默认失败');
                  }
                }}
                disabled={isLoading}
              >
                恢复默认
              </ActionButton>
            }>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>
                    模型分类
                  </Typography>
                  <Tabs
                    value={selectedCategory}
                    onChange={(e, newValue) => setSelectedCategory(newValue)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ mb: 2, '& .MuiTabs-indicator': { height: 3, borderRadius: 2 } }}
                  >
                    <Tab label="聊天" value="chat" />
                    <Tab label="代码" value="code" />
                    <Tab label="图像" value="image" />
                    <Tab label="推理" value="reasoning" />
                    <Tab label="创意" value="creative" />
                    <Tab label="嵌入" value="embedding" />
                    <Tab label="其他" value="other" />
                  </Tabs>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="搜索模型"
                    value={modelSearchTerm}
                    onChange={(e) => setModelSearchTerm(e.target.value)}
                    placeholder="输入模型名称或ID进行搜索..."
                    sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>默认模型</InputLabel>
                    <Select
                      value={settings.ai.defaultModel}
                      onChange={(e) => handleSettingChange('ai', 'defaultModel', e.target.value)}
                      disabled={modelsLoading}
                    >
                      {modelsLoading ? (
                        <MenuItem disabled>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress sx={{ flex: 1 }} />
                            <Typography>加载模型中...</Typography>
                          </Box>
                        </MenuItem>
                      ) : (
                        getFilteredModels().map((model) => (
                          <MenuItem key={model.id} value={model.id}>
                            <Box>
                              <Typography variant="body2" fontWeight="bold">
                                {model.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {model.id} • 上下文: {model.context_length?.toLocaleString() || 'N/A'}
                                {model.pricing && (
                                  <> • 价格: ${model.pricing.prompt || 0}/1K tokens</>
                                )}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))
                      )}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <Typography gutterBottom>
                    温度: {settings.ai.temperature}
                  </Typography>
                  <Slider
                    value={settings.ai.temperature}
                    onChange={(e, value) => handleSettingChange('ai', 'temperature', value)}
                    min={0}
                    max={2}
                    step={0.1}
                    marks
                    valueLabelDisplay="auto"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="最大Token数"
                    type="number"
                    value={settings.ai.maxTokens}
                    onChange={(e) => handleSettingChange('ai', 'maxTokens', parseInt(e.target.value))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.ai.streamResponse}
                        onChange={(e) => handleSettingChange('ai', 'streamResponse', e.target.checked)}
                      />
                    }
                    label="流式响应"
                  />
                </Grid>
              </Grid>
            </CardSection>
          </Grid>
        </Grid>
      )}
      
      {/* API管理 */}
      {activeTab === 4 && (
        <CardSection
          title="API密钥管理"
          headerActions={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <TextField
                size="small"
                placeholder="筛选名称/密钥/状态"
                value={apiFilter}
                onChange={(e) => setApiFilter(e.target.value)}
                sx={{ minWidth: 220, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <ActionButton
                variant="contained"
                startIcon={<Add />}
                onClick={() => setShowApiDialog(true)}
              >
                添加API密钥
              </ActionButton>
            </Box>
          }
        >
          <TableContainer component={Paper} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell>密钥</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>最后使用</TableCell>
                  <TableCell>使用率</TableCell>
                  <TableCell>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {apiKeys
                  .filter((k) => {
                    if (!apiFilter) return true;
                    const q = apiFilter.toLowerCase();
                    return (
                      k.name.toLowerCase().includes(q) ||
                      k.key.toLowerCase().includes(q) ||
                      k.status.toLowerCase().includes(q)
                    );
                  })
                  .map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>{apiKey.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {apiKey.key}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {getStatusChip(apiKey.status)}
                    </TableCell>
                    <TableCell>{apiKey.lastUsed}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <LinearProgress
                          variant="determinate"
                          value={apiKey.usage}
                          sx={{ width: 100, mr: 1 }}
                        />
                        <Typography variant="body2">
                          {apiKey.usage}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteApiKey(apiKey.id)}
                      >
                        <Delete />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardSection>
      )}
      
      {/* 添加API密钥对话框 */}
      <Dialog
        open={showApiDialog}
        onClose={() => setShowApiDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          添加API密钥
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="密钥名称"
                value={newApiKey.name}
                onChange={(e) => setNewApiKey(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如：OpenRouter API"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="API密钥"
                value={newApiKey.key}
                onChange={(e) => setNewApiKey(prev => ({ ...prev, key: e.target.value }))}
                placeholder="sk-or-v1-..."
                type="password"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, backgroundColor: 'background.paper' } }}
              />
            </Grid>
          </Grid>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            API密钥将被安全加密存储，仅用于与相应服务的通信。
          </Alert>
        </DialogContent>
        <DialogActions>
          <ActionButton onClick={() => setShowApiDialog(false)} variant="text">取消</ActionButton>
          <ActionButton
            variant="contained"
            onClick={handleAddApiKey}
            loading={addingApi}
            disabled={!newApiKey.name || !newApiKey.key}
            startIcon={<Add />}
          >
            添加
          </ActionButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;