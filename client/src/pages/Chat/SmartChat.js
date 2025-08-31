import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Avatar,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  Chip,
  CircularProgress,
  Paper,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Send,
  Menu as MenuIcon,
  Add,
  MoreVert,
  Delete,
  ContentCopy,
  ThumbUp,
  ThumbDown,
  Refresh,
  AutoAwesome
} from '@mui/icons-material';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../services/settingsService';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

const SmartChat = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user, token, isAuthenticated } = useAuthStore();
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
    fetchSupportedModels
  } = useChatStore();

  const [newMessage, setNewMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);
  const [newConversationData, setNewConversationData] = useState({
    title: '',
    type: 'chat',
    model: settings?.ai?.defaultModel || '',
    systemPrompt: ''
  });
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchConversations();
      fetchSupportedModels();
    }
  }, [isAuthenticated, fetchConversations, fetchSupportedModels]);

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

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getConvId = (conv, idx) => {
    if (conv?.id) return conv.id;
    if (conv?._id) return conv._id;
    // 为没有ID的对话生成唯一标识
    const title = conv?.title ? conv.title.slice(0, 10).replace(/\s/g, '') : 'untitled';
    const timestamp = conv?.createdAt || conv?.updatedAt || Date.now();
    return `conv-${idx}-${title}-${timestamp}`;
  };
  const getMsgId = (msg, idx) => {
    if (msg?.id) return msg.id;
    if (msg?._id) return msg._id;
    // 使用消息内容和索引生成稳定的key
    const contentHash = msg?.content ? msg.content.slice(0, 10).replace(/\s/g, '') : 'empty';
    return `msg-${idx}-${contentHash}-${msg?.role || 'unknown'}`;
  };
  const formatModelLabel = (model) => {
    if (!model) return 'unknown-model';
    if (typeof model === 'string') return model;
    const provider = model.provider || '';
    const name = model.name || '';
    const version = model.version ? `:${model.version}` : '';
    const joined = [provider, name].filter(Boolean).join('/');
    return joined ? `${joined}${version}` : 'unknown-model';
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      toast.error('请输入消息内容');
      return;
    }
    
    if (!currentConversation) {
      toast.error('请先选择或创建一个对话');
      return;
    }

    try {
      // 直接使用ID而不是getConvId
      const conversationId = currentConversation.id || currentConversation._id;
      if (!conversationId) {
        toast.error('对话ID无效，请重新选择对话');
        return;
      }
      
      console.log('发送消息:', { conversationId, message: newMessage, user, token, isAuthenticated });
      await sendMessage(conversationId, newMessage);
      setNewMessage('');
      inputRef.current?.focus();
    } catch (error) {
      console.error('发送消息失败详细错误:', error);
      console.error('错误响应:', error.response?.data);
      console.error('错误状态码:', error.response?.status);
      
      // 如果是404错误，说明对话不存在，提示用户重新选择
      if (error.response?.status === 404) {
        toast.error('当前对话不存在，请重新选择对话');
        return;
      }
      
      const errorMessage = error.response?.data?.message || error.message || '发送消息失败';
      toast.error(errorMessage);
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
        toast.error('请选择模型');
        return;
      }

      const [provider, nameWithVersion] = model.split('/');
      const [name, version] = (nameWithVersion || '').split(':');
      const payload = {
        title: title.trim(),
        type,
        model: {
          provider,
          name,
          ...(version ? { version } : {})
        },
        systemPrompt
      };

      await createConversation(payload);
      setShowNewConversationDialog(false);
      setNewConversationData({
        title: '',
        type: 'chat',
        model: settings?.ai?.defaultModel || '',
        systemPrompt: ''
      });
      toast.success('对话创建成功');
      if (isMobile) setSidebarOpen(false);
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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const renderMessage = (message, idx) => {
    const isUser = message.role === 'user';
    const isAI = message.role === 'assistant';

    return (
      <Box
        key={getMsgId(message, idx)}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          mb: 4,
          maxWidth: '100%'
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2,
            flexDirection: isUser ? 'row-reverse' : 'row'
          }}
        >
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: isUser ? 'primary.main' : 'grey.100',
              color: isUser ? 'white' : 'primary.main',
              fontSize: '14px',
              fontWeight: 600
            }}
          >
            {isUser ? user?.username?.charAt(0)?.toUpperCase() || 'U' : <AutoAwesome />}
          </Avatar>
          
          <Box
            sx={{
              flex: 1,
              maxWidth: isUser ? '80%' : '100%'
            }}
          >
            <Box
              sx={{
                bgcolor: isUser ? 'primary.main' : 'background.paper',
                color: isUser ? 'white' : 'text.primary',
                borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                p: 2,
                border: isUser ? 'none' : '1px solid',
                borderColor: isUser ? 'transparent' : 'divider',
                position: 'relative',
                boxShadow: isUser ? 'none' : '0 8px 24px rgba(2, 8, 23, 0.06)',
                '& pre': {
                  borderRadius: 2,
                  overflow: 'auto',
                  border: '1px solid',
                  borderColor: isUser ? 'rgba(255,255,255,0.25)' : 'rgba(2, 8, 23, 0.12)'
                },
                '& code': {
                  fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                  fontSize: '0.9rem',
                  backgroundColor: isUser ? 'rgba(255,255,255,0.16)' : 'grey.100',
                  borderRadius: 1,
                  px: 0.5,
                  py: 0.25
                },
                '& p': {
                  mb: 1.5
                }
              }}
            >
              {isAI && (
                <IconButton
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    opacity: 0.7,
                    '&:hover': { opacity: 1 }
                  }}
                  onClick={(e) => {
                    setAnchorEl(e.currentTarget);
                    setSelectedMessage(message);
                  }}
                >
                  <MoreVert fontSize="small" />
                </IconButton>
              )}
              
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
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  const sidebarContent = (
    <Box sx={{ width: 280, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Button
          fullWidth
          variant="outlined"
          startIcon={<Add />}
          onClick={() => setShowNewConversationDialog(true)}
          sx={{
            borderRadius: 3,
            textTransform: 'none',
            py: 1.5
          }}
        >
          新建对话
        </Button>
      </Box>
      
      <List sx={{ flexGrow: 1, overflow: 'auto', px: 1 }}>
        {conversations.map((conversation, index) => {
          const cid = getConvId(conversation, index);
          // 直接比较ID而不是使用getConvId，避免索引问题
          const isSelected = currentConversation && (
            (currentConversation.id && currentConversation.id === conversation.id) ||
            (currentConversation._id && currentConversation._id === conversation._id)
          );
          
          return (
            <ListItem key={cid} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={isSelected}
                onClick={() => {
                  // 确保只传递真正的数据库ID
                  const realId = conversation.id || conversation._id;
                  if (realId) {
                    selectConversation(realId);
                    if (isMobile) setSidebarOpen(false);
                  }
                }}
                sx={{
                  borderRadius: 2,
                  '&.Mui-selected': {
                    bgcolor: 'primary.50',
                    '&:hover': {
                      bgcolor: 'primary.100'
                    }
                  }
                }}
              >
                <ListItemText
                  primary={conversation.title}
                  secondary={formatModelLabel(conversation.model)}
                  primaryTypographyProps={{
                    fontSize: '14px',
                    fontWeight: isSelected ? 600 : 400,
                    noWrap: true
                  }}
                  secondaryTypographyProps={{
                    fontSize: '12px',
                    noWrap: true
                  }}
                />
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(cid);
                  }}
                  sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                >
                  <Delete fontSize="small" />
                </IconButton>
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
      {/* 侧边栏 */}
      {isMobile ? (
        <Drawer
          anchor="left"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          ModalProps={{ keepMounted: true }}
        >
          {sidebarContent}
        </Drawer>
      ) : (
        <Paper
          elevation={0}
          sx={{
            width: sidebarOpen ? 280 : 0,
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            borderRight: 1,
            borderColor: 'divider'
          }}
        >
          {sidebarOpen && sidebarContent}
        </Paper>
      )}

      {/* 主聊天区域 */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 顶部工具栏 */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          <IconButton
            onClick={() => setSidebarOpen(!sidebarOpen)}
            sx={{ mr: 1 }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
            {currentConversation?.title || '智能助手'}
          </Typography>
          
          {currentConversation && (
            <Chip
              label={formatModelLabel(currentConversation.model)}
              size="small"
              variant="outlined"
              sx={{ borderRadius: 2 }}
            />
          )}
        </Box>

        {/* 消息区域 */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            p: 3,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {currentConversation ? (
            <>
              {messages.length === 0 ? (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    textAlign: 'center',
                    color: 'text.secondary'
                  }}
                >
                  <AutoAwesome sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                  <Typography variant="h5" sx={{ mb: 1, fontWeight: 300 }}>
                    你好，我是智能助手
                  </Typography>
                  <Typography variant="body1">
                    我可以帮助你解答问题、创作内容、分析数据等
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ maxWidth: '800px', mx: 'auto', width: '100%' }}>
                  {messages.map((message, index) => renderMessage(message, index))}
                  {isLoading && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'grey.100' }}>
                        <AutoAwesome sx={{ color: 'primary.main' }} />
                      </Avatar>
                      <CircularProgress size={20} />
                      <Typography variant="body2" color="text.secondary">
                        正在思考...
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center',
                color: 'text.secondary'
              }}
            >
              <AutoAwesome sx={{ fontSize: 64, mb: 3, opacity: 0.3 }} />
              <Typography variant="h4" sx={{ mb: 2, fontWeight: 300 }}>
                欢迎使用智能助手
              </Typography>
              <Typography variant="body1" sx={{ mb: 3 }}>
                选择一个对话开始聊天，或创建新的对话
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setShowNewConversationDialog(true)}
                sx={{ borderRadius: 3, textTransform: 'none', px: 3, py: 1.5 }}
              >
                开始新对话
              </Button>
            </Box>
          )}
        </Box>

        {/* 输入区域 */}
        {currentConversation && (
          <Box
            sx={{
              p: 3,
              borderTop: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper'
            }}
          >
            <Box sx={{ maxWidth: '800px', mx: 'auto' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 1,
                  bgcolor: 'background.paper',
                  borderRadius: 3,
                  p: 1,
                  border: 1,
                  borderColor: 'divider',
                  boxShadow: '0 8px 24px rgba(2, 8, 23, 0.06)',
                  '&:focus-within': {
                    borderColor: 'primary.main',
                    boxShadow: '0 12px 32px rgba(25, 118, 210, 0.2)'
                  }
                }}
              >
                <TextField
                  ref={inputRef}
                  fullWidth
                  multiline
                  maxRows={6}
                  placeholder="输入消息..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  variant="standard"
                  InputProps={{
                    disableUnderline: true,
                    sx: {
                      fontSize: '16px',
                      lineHeight: 1.5,
                      '& .MuiInputBase-input': {
                        p: 1
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
                    width: 44,
                    height: 44,
                    borderRadius: 2,
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
            </Box>
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
        <DialogTitle>新建对话</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="对话标题"
            value={newConversationData.title}
            onChange={(e) => setNewConversationData({ ...newConversationData, title: e.target.value })}
            sx={{ mb: 2, mt: 1 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
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
          <FormControl fullWidth sx={{ mb: 2 }}>
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
        <DialogActions>
          <Button onClick={() => setShowNewConversationDialog(false)}>取消</Button>
          <Button onClick={handleCreateConversation} variant="contained">创建</Button>
        </DialogActions>
      </Dialog>

      {/* 消息操作菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => handleMessageAction('copy', selectedMessage)}>
          <ContentCopy sx={{ mr: 1 }} fontSize="small" /> 复制
        </MenuItem>
        <MenuItem onClick={() => handleMessageAction('like', selectedMessage)}>
          <ThumbUp sx={{ mr: 1 }} fontSize="small" /> 点赞
        </MenuItem>
        <MenuItem onClick={() => handleMessageAction('dislike', selectedMessage)}>
          <ThumbDown sx={{ mr: 1 }} fontSize="small" /> 点踩
        </MenuItem>
        <MenuItem onClick={() => handleMessageAction('regenerate', selectedMessage)}>
          <Refresh sx={{ mr: 1 }} fontSize="small" /> 重新生成
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default SmartChat;