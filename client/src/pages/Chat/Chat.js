import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,

  Avatar,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  CircularProgress,
  InputAdornment,
  Drawer,
  useTheme,
  useMediaQuery,
  Fade
} from '@mui/material';
import {
  Send,
  MoreVert,
  Delete,
  Search,
  Refresh,
  ThumbUp,
  ThumbDown,
  ContentCopy,
  Person,
  Settings,
  Menu as MenuIcon,
  Close,
  AutoAwesome,
  Edit,
  History
} from '@mui/icons-material';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../services/settingsService';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

const Chat = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user, isAuthenticated } = useAuthStore();
  const { settings } = useSettingsStore();
  const {
    conversations,
    currentConversation,
    messages,
    supportedModels,
    isLoading,
    fetchConversations,
    createConversation,
    selectConversation,
    sendMessage,
    deleteConversation,
    fetchSupportedModels,
    validateCurrentConversation
  } = useChatStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);
  const [newConversationData, setNewConversationData] = useState({
    title: '',
    type: 'chat',
    model: settings?.ai?.defaultModel || '',
    systemPrompt: ''
  });
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchConversations();
      fetchSupportedModels();
      validateCurrentConversation();
    }
  }, [isAuthenticated, fetchConversations, fetchSupportedModels, validateCurrentConversation]);

  useEffect(() => {
    if (settings?.ai?.defaultModel) {
      setNewConversationData(prev => ({
        ...prev,
        model: settings.ai.defaultModel
      }));
    }
  }, [settings?.ai?.defaultModel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getConvId = (conversation) => {
    return conversation?._id || conversation?.id;
  };

  const formatModelLabel = (model) => {
    if (!model) return '';
    
    // Handle object type model
    let modelString = '';
    if (typeof model === 'object' && model !== null) {
      const provider = String(model.provider || '');
      const name = String(model.name || '');
      const version = model.version ? `:${String(model.version)}` : '';
      modelString = [provider, name].filter(Boolean).join('/') + version;
    } else if (typeof model === 'string') {
      modelString = model;
    } else {
      return 'unknown-model';
    }
    
    const modelMap = {
      // OpenRouter format models
      'openai/gpt-4': 'GPT-4',
      'openai/gpt-3.5-turbo': 'GPT-3.5',
      'openai/gpt-4-turbo': 'GPT-4 Turbo',
      'anthropic/claude-3-opus': 'Claude 3 Opus',
      'anthropic/claude-3-sonnet': 'Claude 3 Sonnet',
      'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
      'google/gemini-pro': 'Gemini Pro',
      // Legacy format for backward compatibility
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5',
      'claude-3-opus': 'Claude 3 Opus',
      'claude-3-sonnet': 'Claude 3 Sonnet'
    };
    return modelMap[modelString] || modelString.replace('/', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentConversation) return;
    
    try {
      await sendMessage(getConvId(currentConversation), newMessage);
      setNewMessage('');
    } catch (error) {
      toast.error('发送消息失败');
    }
  };

  const handleCreateConversation = async () => {
    try {
      const { title, type, model, systemPrompt } = newConversationData;
      
      if (!title.trim()) {
        toast.error('请输入对话标题');
        return;
      }
      
      if (!model) {
        toast.error('请选择AI模型');
        return;
      }

      const selectedModel = supportedModels.find(m => m.id === model);
      const { version, ...modelInfo } = selectedModel || {};
      
      const payload = {
        title,
        type,
        model: {
          ...modelInfo,
          ...(version ? { version } : {})
        },
        systemPrompt
      };

      await createConversation(payload);
      setShowNewConversationDialog(false);
      setNewConversationData({
        title: '',
        type: 'chat',
        model: '',
        systemPrompt: ''
      });
      toast.success('对话创建成功');
    } catch (error) {
      toast.error('创建对话失败');
    }
  };

  const handleDeleteConversation = async (conversationId) => {
    try {
      await deleteConversation(conversationId);
      toast.success('对话删除成功');
    } catch (error) {
      toast.error('删除对话失败');
    }
  };

  const handleMessageAction = (action, message) => {
    switch (action) {
      case 'copy':
        navigator.clipboard.writeText(message.content);
        toast.success('已复制到剪贴板');
        break;
      case 'like':
      case 'dislike':
        toast.info('反馈已记录');
        break;
      case 'regenerate':
        toast.info('正在重新生成...');
        break;
      default:
        break;
    }
    setAnchorEl(null);
  };

  const filteredConversations = conversations.filter(conv =>
    (conv.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sidebarContent = (
    <Box sx={{ 
      width: isMobile ? '100vw' : 320, 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      bgcolor: 'background.paper'
    }}>
      {/* 侧边栏头部 */}
      <Box sx={{ 
        p: 3, 
        borderBottom: 1, 
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main' }}>
          AI 助手
        </Typography>
        {isMobile && (
          <IconButton onClick={() => setSidebarOpen(false)}>
            <Close />
          </IconButton>
        )}
      </Box>

      {/* 新建对话按钮 */}
      <Box sx={{ p: 3, pb: 2 }}>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<Edit />}
          onClick={() => setShowNewConversationDialog(true)}
          sx={{ 
            borderRadius: 3,
            py: 1.5,
            textTransform: 'none',
            fontSize: '16px',
            fontWeight: 500,
            borderColor: 'divider',
            '&:hover': {
              bgcolor: 'action.hover',
              borderColor: 'primary.main'
            }
          }}
        >
          新建对话
        </Button>
      </Box>

      {/* 搜索框 */}
      <Box sx={{ px: 3, pb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="搜索对话..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: 'action.hover',
              '& fieldset': {
                border: 'none'
              },
              '&:hover fieldset': {
                border: 'none'
              },
              '&.Mui-focused fieldset': {
                border: '1px solid',
                borderColor: 'primary.main'
              }
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            )
          }}
        />
      </Box>
      
      {/* 对话列表 */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', px: 2 }}>
        {filteredConversations.length === 0 ? (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '200px',
            color: 'text.secondary'
          }}>
            <History sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
            <Typography variant="body2">暂无对话记录</Typography>
          </Box>
        ) : (
          filteredConversations.map((conversation) => {
            const cid = getConvId(conversation);
            const isSelected = getConvId(currentConversation) === cid;
            return (
              <Paper
                key={cid}
                elevation={0}
                sx={{
                  mb: 1,
                  borderRadius: 2,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  bgcolor: isSelected ? 'primary.main' : 'transparent',
                  color: isSelected ? 'primary.contrastText' : 'text.primary',
                  '&:hover': {
                    bgcolor: isSelected ? 'primary.dark' : 'action.hover'
                  }
                }}
                onClick={() => {
                  selectConversation(cid);
                  if (isMobile) setSidebarOpen(false);
                }}
              >
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar sx={{ 
                    width: 32, 
                    height: 32,
                    bgcolor: isSelected ? 'primary.contrastText' : 'primary.main',
                    color: isSelected ? 'primary.main' : 'primary.contrastText'
                  }}>
                    <AutoAwesome sx={{ fontSize: 18 }} />
                  </Avatar>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 500,
                        noWrap: true,
                        mb: 0.5
                      }}
                    >
                      {conversation.title || '新对话'}
                    </Typography>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        opacity: 0.8,
                        fontSize: '12px'
                      }}
                    >
                      {formatModelLabel(conversation.model)}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(cid);
                    }}
                    sx={{ 
                      opacity: 0.7,
                      '&:hover': { opacity: 1 }
                    }}
                  >
                    <Delete sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </Paper>
            );
          })
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
      {/* 侧边栏 - 桌面端 */}
      {!isMobile && (
        <Drawer
          variant="persistent"
          open={sidebarOpen}
          sx={{
            '& .MuiDrawer-paper': {
              position: 'relative',
              border: 'none',
              boxShadow: 'none'
            }
          }}
        >
          {sidebarContent}
        </Drawer>
      )}

      {/* 侧边栏 - 移动端 */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          ModalProps={{
            keepMounted: true
          }}
        >
          {sidebarContent}
        </Drawer>
      )}

      {/* 主聊天区域 */}
      <Box sx={{ 
        flexGrow: 1, 
        display: 'flex', 
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'background.default'
      }}>
        {currentConversation ? (
          <>
            {/* 顶部工具栏 */}
            <Paper 
              elevation={0} 
              sx={{ 
                p: 2, 
                borderBottom: 1, 
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                bgcolor: 'background.paper'
              }}
            >
              {isMobile && (
                <IconButton onClick={() => setSidebarOpen(true)}>
                  <MenuIcon />
                </IconButton>
              )}
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <AutoAwesome sx={{ fontSize: 18 }} />
              </Avatar>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '18px' }}>
                  {currentConversation.title || '新对话'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatModelLabel(currentConversation.model)}
                </Typography>
              </Box>
              <IconButton>
                <Settings />
              </IconButton>
            </Paper>

            {/* 消息列表 */}
            <Box sx={{ 
              flexGrow: 1, 
              overflow: 'auto', 
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 3
            }}>
              {messages.length === 0 ? (
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  height: '100%',
                  color: 'text.secondary'
                }}>
                  <AutoAwesome sx={{ fontSize: 64, mb: 3, opacity: 0.3 }} />
                  <Typography variant="h5" sx={{ mb: 2, fontWeight: 500 }}>
                    开始新的对话
                  </Typography>
                  <Typography variant="body1" sx={{ textAlign: 'center', maxWidth: 400 }}>
                    向AI助手提问任何问题，我会尽力为您提供帮助
                  </Typography>
                </Box>
              ) : (
                messages.map((message, index) => (
                  <Fade key={index} in timeout={300}>
                    <Box sx={{ 
                      display: 'flex', 
                      gap: 3,
                      alignItems: 'flex-start',
                      maxWidth: '100%'
                    }}>
                      <Avatar sx={{ 
                        bgcolor: message.role === 'user' ? 'grey.300' : 'primary.main',
                        width: 32,
                        height: 32
                      }}>
                        {message.role === 'user' ? <Person /> : <AutoAwesome />}
                      </Avatar>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ 
                          color: 'text.secondary',
                          fontWeight: 500,
                          mb: 1,
                          display: 'block'
                        }}>
                          {message.role === 'user' ? user?.username || '用户' : 'AI助手'}
                        </Typography>
                        <Paper 
                          elevation={0}
                          sx={{ 
                            p: 3,
                            borderRadius: 3,
                            bgcolor: message.role === 'user' ? 'grey.50' : 'background.paper',
                            border: 1,
                            borderColor: 'divider',
                            '& pre': {
                              bgcolor: 'grey.100',
                              borderRadius: 2,
                              p: 2,
                              overflow: 'auto'
                            }
                          }}
                        >
                          <ReactMarkdown
                            components={{
                              code({ node, inline, className, children, ...props }) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    style={tomorrow}
                                    language={match[1]}
                                    PreTag="div"
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              }
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </Paper>
                        {message.role === 'assistant' && (
                          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                setAnchorEl(e.currentTarget);
                                setSelectedMessage(message);
                              }}
                            >
                              <MoreVert sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  </Fade>
                ))
              )}
              {isLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
                  <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                    <AutoAwesome />
                  </Avatar>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <CircularProgress size={16} />
                    <Typography color="text.secondary">AI正在思考...</Typography>
                  </Box>
                </Box>
              )}
              <div ref={messagesEndRef} />
            </Box>

            {/* 消息输入区域 */}
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3, 
                borderTop: 1, 
                borderColor: 'divider',
                bgcolor: 'background.paper'
              }}
            >
              <Box sx={{ 
                display: 'flex', 
                gap: 2, 
                alignItems: 'flex-end',
                maxWidth: '100%'
              }}>
                <TextField
                  fullWidth
                  multiline
                  maxRows={4}
                  placeholder="输入消息..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      bgcolor: 'grey.50',
                      '& fieldset': {
                        border: 'none'
                      },
                      '&:hover fieldset': {
                        border: 'none'
                      },
                      '&.Mui-focused fieldset': {
                        border: '2px solid',
                        borderColor: 'primary.main'
                      }
                    }
                  }}
                />
                <IconButton
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || isLoading}
                  sx={{
                    bgcolor: newMessage.trim() ? 'primary.main' : 'grey.300',
                    color: 'white',
                    width: 48,
                    height: 48,
                    '&:hover': {
                      bgcolor: newMessage.trim() ? 'primary.dark' : 'grey.400'
                    },
                    '&.Mui-disabled': {
                      bgcolor: 'grey.300',
                      color: 'grey.500'
                    }
                  }}
                >
                  <Send />
                </IconButton>
              </Box>
            </Paper>
          </>
        ) : (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            flexDirection: 'column',
            gap: 3
          }}>
            {isMobile && (
              <Box sx={{ position: 'absolute', top: 16, left: 16 }}>
                <IconButton onClick={() => setSidebarOpen(true)}>
                  <MenuIcon />
                </IconButton>
              </Box>
            )}
            <AutoAwesome sx={{ fontSize: 80, color: 'primary.main', opacity: 0.5 }} />
            <Typography variant="h4" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              选择一个对话开始聊天
            </Typography>
            <Typography variant="body1" color="text.secondary">
              或者创建一个新的对话
            </Typography>
          </Box>
        )}
      </Box>

      {/* 新建对话弹窗 */}
      <Dialog 
        open={showNewConversationDialog} 
        onClose={() => setShowNewConversationDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            新建对话
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            fullWidth
            label="对话标题"
            value={newConversationData.title}
            onChange={(e) => setNewConversationData({ ...newConversationData, title: e.target.value })}
            sx={{ mb: 3 }}
          />
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>对话类型</InputLabel>
            <Select
              value={newConversationData.type}
              onChange={(e) => setNewConversationData({ ...newConversationData, type: e.target.value })}
            >
              <MenuItem value="chat">通用对话</MenuItem>
              <MenuItem value="business">商业分析</MenuItem>
              <MenuItem value="rag">文档/RAG</MenuItem>
              <MenuItem value="code">代码助理</MenuItem>
              <MenuItem value="creative">创意写作</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>AI模型</InputLabel>
            <Select
              value={newConversationData.model}
              onChange={(e) => setNewConversationData({ ...newConversationData, model: e.target.value })}
            >
              {supportedModels.map((model) => (
                <MenuItem key={model.id} value={model.id}>
                  {model.name || model.id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="系统提示词（可选）"
            value={newConversationData.systemPrompt}
            onChange={(e) => setNewConversationData({ ...newConversationData, systemPrompt: e.target.value })}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => setShowNewConversationDialog(false)}>
            取消
          </Button>
          <Button onClick={handleCreateConversation} variant="contained">
            创建
          </Button>
        </DialogActions>
      </Dialog>

      {/* 消息操作菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => handleMessageAction('like', selectedMessage)}>
          <ThumbUp sx={{ mr: 1 }} /> 点赞
        </MenuItem>
        <MenuItem onClick={() => handleMessageAction('dislike', selectedMessage)}>
          <ThumbDown sx={{ mr: 1 }} /> 点踩
        </MenuItem>
        <MenuItem onClick={() => handleMessageAction('copy', selectedMessage)}>
          <ContentCopy sx={{ mr: 1 }} /> 复制
        </MenuItem>
        <MenuItem onClick={() => handleMessageAction('regenerate', selectedMessage)}>
          <Refresh sx={{ mr: 1 }} /> 重新生成
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default Chat;
