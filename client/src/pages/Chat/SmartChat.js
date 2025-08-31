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
  useMediaQuery,
  Fade,
  Slide,
  Grow,
  Divider,
  Card,
  CardContent
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
  AutoAwesome,
  Stop,
  Search
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
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'));
  const isSmallMobile = useMediaQuery(theme.breakpoints.down('sm'));
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
    fetchSupportedModels,
    // 新增：流式与停止
    sendStreamMessage,
    isStreaming,
    stopStreaming
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
    if (typeof model === 'object' && model !== null) {
      const provider = String(model.provider || '');
      const name = String(model.name || '');
      const version = model.version ? `:${String(model.version)}` : '';
      const joined = [provider, name].filter(Boolean).join('/');
      return joined ? `${joined}${version}` : 'unknown-model';
    }
    return 'unknown-model';
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      toast.error('请输入消息内容');
      return;
    }
    
    if (isStreaming) {
      toast('正在生成中，请先停止或等待完成');
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
      
      console.log('发送消息(流式):', { conversationId, message: newMessage });
      await sendStreamMessage(conversationId, { content: newMessage });
      setNewMessage('');
      inputRef.current?.focus();
    } catch (error) {
      console.error('发送消息失败详细错误:', error);
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
      if (!isStreaming) handleSendMessage();
    }
  };

  const renderMessage = (message, idx) => {
    const isUser = message.role === 'user';
    const isAI = message.role === 'assistant';

    return (
      <Fade in={true} timeout={300}>
        <Box
          key={getMsgId(message, idx)}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            mb: 3,
            maxWidth: '100%'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: { xs: 1.5, sm: 2 },
              flexDirection: isUser ? 'row-reverse' : 'row',
              px: { xs: 1, sm: 2 }
            }}
          >
            <Avatar
              sx={{
                width: { xs: 32, sm: 36 },
                height: { xs: 32, sm: 36 },
                bgcolor: isUser ? '#1a73e8' : '#f1f3f4',
                color: isUser ? 'white' : '#1a73e8',
                fontSize: { xs: '12px', sm: '14px' },
                fontWeight: 500,
                boxShadow: isUser ? '0 2px 8px rgba(26,115,232,0.3)' : 'none'
              }}
            >
              {isUser ? user?.username?.charAt(0)?.toUpperCase() || 'U' : <AutoAwesome />}
            </Avatar>
            
            <Box
              sx={{
                flex: 1,
                maxWidth: isUser ? '75%' : '100%'
              }}
            >
              <Box
                sx={{
                  bgcolor: isUser ? '#1a73e8' : '#ffffff',
                  color: isUser ? 'white' : '#3c4043',
                  borderRadius: isUser ? { xs: '16px 16px 4px 16px', sm: '20px 20px 6px 20px' } : { xs: '16px 16px 16px 4px', sm: '20px 20px 20px 6px' },
                  p: { xs: 2, sm: 2.5 },
                  border: isUser ? 'none' : '1px solid #e8eaed',
                  position: 'relative',
                  boxShadow: isUser ? '0 2px 12px rgba(26,115,232,0.3)' : '0 1px 3px rgba(60,64,67,0.15)',
                  fontFamily: 'Google Sans, sans-serif',
                  fontSize: { xs: '13px', sm: '14px' },
                  lineHeight: 1.6,
                  '& pre': {
                    borderRadius: 2,
                    overflow: 'auto',
                    border: '1px solid',
                    borderColor: isUser ? 'rgba(255,255,255,0.25)' : '#e8eaed'
                  },
                  '& code': {
                    fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                    fontSize: '0.9rem',
                    backgroundColor: isUser ? 'rgba(255,255,255,0.16)' : '#f1f3f4',
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
                    if (!inline && match) {
                      const codeText = String(children).replace(/\n$/, '');
                      return (
                        <Box sx={{ position: 'relative' }}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              navigator.clipboard.writeText(codeText);
                              toast.success('代码已复制');
                            }}
                            sx={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              zIndex: 1,
                              bgcolor: 'rgba(0,0,0,0.5)',
                              color: '#fff',
                              '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
                            }}
                          >
                            <ContentCopy fontSize="inherit" />
                          </IconButton>
                          <SyntaxHighlighter
                            style={tomorrow}
                            language={match[1]}
                            PreTag="div"
                            {...props}
                          >
                            {codeText}
                          </SyntaxHighlighter>
                        </Box>
                      );
                    }
                    return (
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
      </Fade>
    );
  };

  const sidebarContent = (
    <Box sx={{ width: 280, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 3, borderBottom: '1px solid #e8eaed' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: '#1a73e8',
              mr: 2,
              fontSize: '16px'
            }}
          >
            <AutoAwesome sx={{ fontSize: 18 }} />
          </Avatar>
          <Typography
            variant="h6"
            sx={{
              fontFamily: 'Google Sans, sans-serif',
              fontWeight: 500,
              color: '#3c4043',
              fontSize: '18px'
            }}
          >
            Gemini
          </Typography>
        </Box>
        <Button
          fullWidth
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowNewConversationDialog(true)}
          sx={{
            borderRadius: '24px',
            textTransform: 'none',
            fontSize: '14px',
            fontWeight: 500,
            py: 1.5,
            bgcolor: '#1a73e8',
            boxShadow: '0 1px 3px rgba(26,115,232,0.4)',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              bgcolor: '#1557b0',
              boxShadow: '0 2px 8px rgba(26,115,232,0.4)',
              transform: 'translateY(-1px)'
            }
          }}
        >
          新对话
        </Button>
      </Box>
      
      <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #e8eaed' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="搜索对话..."
          variant="outlined"
          InputProps={{
            startAdornment: (
              <Search sx={{ color: '#9aa0a6', mr: 1, fontSize: 20 }} />
            )
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '20px',
              backgroundColor: '#f1f3f4',
              border: 'none',
              fontSize: '14px',
              '& fieldset': {
                border: 'none'
              },
              '&:hover fieldset': {
                border: 'none'
              },
              '&.Mui-focused fieldset': {
                border: 'none',
                backgroundColor: '#fff',
                boxShadow: '0 1px 6px rgba(32,33,36,.28)'
              }
            },
            '& .MuiInputBase-input': {
              padding: '8px 12px',
              fontFamily: 'Google Sans, sans-serif',
              '&::placeholder': {
                color: '#9aa0a6',
                opacity: 1
              }
            }
          }}
        />
      </Box>
      
      <Box sx={{ px: 2, py: 1 }}>
        <Typography
          variant="caption"
          sx={{
            color: '#5f6368',
            fontFamily: 'Google Sans, sans-serif',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontSize: '11px'
          }}
        >
          最近对话
        </Typography>
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
            <Slide key={`slide-${cid}-${index}`} direction="right" in={true} timeout={300 + index * 50}>
              <ListItem disablePadding sx={{ mb: 0.5 }}>
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
                    borderRadius: '12px',
                    mx: 1,
                    py: 1.5,
                    transition: 'all 0.2s ease',
                    '&.Mui-selected': {
                      bgcolor: '#e8f0fe',
                      borderLeft: '3px solid #1a73e8',
                      '&:hover': {
                        bgcolor: '#e8f0fe'
                      }
                    },
                    '&:hover': {
                      bgcolor: '#f1f3f4',
                      transform: 'translateX(4px)'
                    }
                  }}
                >
                  <ListItemText
                    primary={conversation.title}
                    secondary={formatModelLabel(conversation.model)}
                    primaryTypographyProps={{
                      fontSize: '14px',
                      fontWeight: isSelected ? 500 : 400,
                      color: isSelected ? '#1a73e8' : '#3c4043',
                      noWrap: true
                    }}
                    secondaryTypographyProps={{
                      fontSize: '12px',
                      color: '#5f6368',
                      noWrap: true
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      const realId = conversation.id || conversation._id;
                      if (realId) {
                        handleDeleteConversation(realId);
                      } else {
                        toast.error('无法删除：缺少对话ID');
                      }
                    }}
                    sx={{ 
                      opacity: 0.6,
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': { 
                        opacity: 1,
                        bgcolor: 'rgba(60,64,67,0.08)',
                        transform: 'scale(1.1)'
                      } 
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </ListItemButton>
              </ListItem>
            </Slide>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ 
      display: 'flex', 
      height: '100vh', 
      bgcolor: '#f8f9fa',
      fontFamily: 'Google Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      overflow: 'hidden',
      flexDirection: { xs: 'column', md: 'row' }
    }}>
      {/* 侧边栏 */}
      {isMobile ? (
        <Drawer
          anchor="left"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: isSmallMobile ? '90%' : '85%',
              maxWidth: '320px',
              bgcolor: '#ffffff',
              borderRight: 'none',
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
            }
          }}
        >
          {sidebarContent}
        </Drawer>
      ) : (
        <Paper
          elevation={0}
          sx={{
            width: sidebarOpen ? (isTablet ? 240 : 280) : 0,
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            borderRight: '1px solid #e8eaed',
            bgcolor: '#ffffff',
            boxShadow: sidebarOpen ? '0 1px 3px rgba(60,64,67,0.3)' : 'none'
          }}
        >
          {sidebarOpen && sidebarContent}
        </Paper>
      )}

      {/* 主聊天区域 */}
      <Box sx={{ 
        flexGrow: 1, 
        display: 'flex', 
        flexDirection: 'column',
        minWidth: 0,
        width: isMobile ? '100%' : 'auto',
        height: '100vh'
      }}>
        {/* 顶部工具栏 */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 3,
            py: 2,
            borderBottom: '1px solid #e8eaed',
            bgcolor: '#ffffff',
            boxShadow: '0 1px 3px rgba(60,64,67,0.08)'
          }}
        >
          <IconButton
            onClick={() => setSidebarOpen(!sidebarOpen)}
            sx={{ 
              mr: 2,
              color: '#5f6368',
              '&:hover': {
                bgcolor: 'rgba(60,64,67,0.08)'
              }
            }}
          >
            <MenuIcon />
          </IconButton>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
            <Avatar 
              sx={{ 
                width: 40, 
                height: 40, 
                bgcolor: '#1a73e8',
                boxShadow: '0 2px 8px rgba(26,115,232,0.3)'
              }}
            >
              <AutoAwesome fontSize="small" />
            </Avatar>
            <Box>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontSize: '18px', 
                  fontWeight: 500,
                  color: '#3c4043',
                  fontFamily: 'Google Sans, sans-serif'
                }}
              >
                {currentConversation?.title || 'Gemini'}
              </Typography>
              {currentConversation && (
                <Chip
                  label={formatModelLabel(currentConversation.model)}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    height: 22, 
                    fontSize: '11px',
                    borderColor: '#dadce0',
                    color: '#5f6368',
                    bgcolor: '#f8f9fa',
                    borderRadius: '11px'
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>

        {/* 消息区域 */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            p: { xs: 2, sm: 3 },
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0
          }}
        >
          {currentConversation ? (
            <>
              {/* 收起的欢迎区域 - 仅在有消息时显示小版本 */}
              {messages.length > 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 1,
                    mb: 2,
                    textAlign: 'center',
                    color: 'text.secondary',
                    transition: 'all 0.3s ease',
                    borderBottom: 1,
                    borderColor: 'divider'
                  }}
                >
                  <AutoAwesome sx={{ fontSize: 20, mr: 1, opacity: 0.5 }} />
                  <Typography variant="body2" sx={{ fontWeight: 300 }}>
                    智能助手
                  </Typography>
                </Box>
              )}
              
              {messages.length === 0 ? (
                <Fade in={true} timeout={800}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      textAlign: 'center',
                      color: '#5f6368'
                    }}
                  >
                    <Grow in={true} timeout={1000}>
                      <Avatar
                        sx={{
                          width: 80,
                          height: 80,
                          bgcolor: '#1a73e8',
                          mb: 3,
                          boxShadow: '0 8px 24px rgba(26,115,232,0.3)'
                        }}
                      >
                        <AutoAwesome sx={{ fontSize: 40 }} />
                      </Avatar>
                    </Grow>
                    <Typography 
                      variant="h4" 
                      sx={{ 
                        mb: 2, 
                        fontWeight: 400,
                        color: '#3c4043',
                        fontFamily: 'Google Sans, sans-serif'
                      }}
                    >
                      你好，我是 Gemini
                    </Typography>
                    <Typography 
                      variant="body1"
                      sx={{
                        fontSize: '16px',
                        lineHeight: 1.6,
                        maxWidth: '500px',
                        color: '#5f6368'
                      }}
                    >
                      我可以帮助你解答问题、创作内容、分析数据等。有什么我可以帮助你的吗？
                    </Typography>
                  </Box>
                </Fade>
              ) : (
                <Box sx={{ maxWidth: '800px', mx: 'auto', width: '100%' }}>
                  {messages.map((message, index) => renderMessage(message, index))}
                  {(isLoading || isStreaming) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: 'grey.100' }}>
                        <AutoAwesome sx={{ color: 'primary.main' }} />
                      </Avatar>
                      <CircularProgress size={20} />
                      <Typography variant="body2" color="text.secondary">
                        {isStreaming ? '正在生成...' : '正在思考...'}
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
              p: { xs: 2, sm: 3 },
              borderTop: '1px solid #e8eaed',
              bgcolor: '#ffffff',
              boxShadow: '0 -2px 8px rgba(60,64,67,0.08)',
              flexShrink: 0
            }}
          >
            <Box sx={{ maxWidth: { xs: '100%', md: '800px' }, mx: 'auto' }}>
              {!isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && (
                <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {['帮我总结上述要点', '给出一个示例代码', '将回答压缩为要点列表'].map((s, i) => (
                    <Chip
                      key={i}
                      label={s}
                      variant="outlined"
                      onClick={() => setNewMessage(s)}
                      sx={{ 
                        borderRadius: '16px',
                        borderColor: '#dadce0',
                        color: '#3c4043',
                        fontSize: '13px',
                        height: '32px',
                        '&:hover': {
                          bgcolor: '#f8f9fa',
                          borderColor: '#1a73e8'
                        }
                      }}
                    />
                  ))}
                </Box>
              )}
              <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: { xs: 1, sm: 2 },
                    bgcolor: '#ffffff',
                    borderRadius: { xs: '20px', sm: '24px' },
                    p: { xs: 1, sm: 1.5 },
                    border: '1px solid #e8eaed',
                    boxShadow: '0 2px 8px rgba(60,64,67,0.15)',
                    transition: 'all 0.2s ease',
                    '&:focus-within': {
                      borderColor: '#1a73e8',
                      boxShadow: '0 4px 16px rgba(26,115,232,0.3)'
                    }
                  }}
                >
                <TextField
                  ref={inputRef}
                  fullWidth
                  multiline
                  maxRows={6}
                  placeholder="向 Gemini 发送消息"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  variant="outlined"
                  InputProps={{
                    sx: {
                      fontSize: '16px',
                      lineHeight: 1.6,
                      fontFamily: 'Google Sans, sans-serif',
                      color: '#3c4043',
                      transition: 'all 0.3s ease-in-out',
                      '& .MuiOutlinedInput-notchedOutline': {
                        border: 'none'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        border: 'none'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        border: 'none'
                      },
                      '&.Mui-focused': {
                        transform: 'scale(1.02)'
                      }
                    }
                  }}
                  inputProps={{
                    style: {
                      padding: '12px 16px',
                      transition: 'all 0.2s ease-in-out'
                    }
                  }}
                  sx={{
                    '& .MuiInputBase-input::placeholder': {
                      color: '#9aa0a6',
                      opacity: 1,
                      fontFamily: 'Google Sans, sans-serif',
                      transition: 'opacity 0.2s ease-in-out'
                    },
                    '& .MuiInputBase-input:focus::placeholder': {
                      opacity: 0.7
                    }
                  }}
                />
                {isStreaming ? (
                  <IconButton
                    onClick={stopStreaming}
                    sx={{
                      bgcolor: '#ea4335',
                      color: 'white',
                      width: 48,
                      height: 48,
                      borderRadius: '24px',
                      boxShadow: '0 2px 8px rgba(234,67,53,0.3)',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        bgcolor: '#d33b2c',
                        boxShadow: '0 4px 12px rgba(234,67,53,0.4)',
                        transform: 'scale(1.05)'
                      }
                    }}
                  >
                    <Stop />
                  </IconButton>
                ) : (
                  <IconButton
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    sx={{
                      bgcolor: newMessage.trim() ? '#1a73e8' : '#f1f3f4',
                      color: newMessage.trim() ? 'white' : '#9aa0a6',
                      width: 48,
                      height: 48,
                      borderRadius: '24px',
                      boxShadow: newMessage.trim() ? '0 2px 8px rgba(26,115,232,0.3)' : 'none',
                      transition: 'all 0.2s ease',
                      animation: newMessage.trim() ? 'pulse 2s infinite' : 'none',
                      '@keyframes pulse': {
                        '0%': {
                          boxShadow: '0 2px 8px rgba(26,115,232,0.3)'
                        },
                        '50%': {
                          boxShadow: '0 4px 16px rgba(26,115,232,0.6)'
                        },
                        '100%': {
                          boxShadow: '0 2px 8px rgba(26,115,232,0.3)'
                        }
                      },
                      '&:hover': {
                        bgcolor: newMessage.trim() ? '#1557b0' : '#e8eaed',
                        boxShadow: newMessage.trim() ? '0 4px 12px rgba(26,115,232,0.4)' : 'none',
                        transform: newMessage.trim() ? 'scale(1.05)' : 'none',
                        animation: 'none'
                      },
                      '&.Mui-disabled': {
                        bgcolor: '#f1f3f4',
                        color: '#9aa0a6',
                        animation: 'none'
                      }
                    }}
                  >
                    <Send />
                  </IconButton>
                )}
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