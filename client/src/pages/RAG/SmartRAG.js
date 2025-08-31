import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,

  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  CircularProgress,

  Drawer,
  useTheme,
  useMediaQuery,
  Stack,
  Card,
  CardContent,
  LinearProgress,
  Alert
} from '@mui/material';
import {
  Send,

  MoreVert,
  Delete,

  Description,
  Folder,

  Menu as MenuIcon,
  Close,
  AutoAwesome,

  History,
  CloudUpload,
  InsertDriveFile,
  PictureAsPdf,
  Article,
  Code,
  DataObject,
  QuestionAnswer,
  Source,
  Lightbulb
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import ragService from '../../services/ragService';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

const SmartRAG = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { isAuthenticated } = useAuthStore();
  
  // 状态管理
  const [knowledgeBase, setKnowledgeBase] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [relatedSources, setRelatedSources] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'documents', 'settings'
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  
  const fileInputRef = useRef(null);


  // 初始化数据
  useEffect(() => {
    if (isAuthenticated) {
      initializeData();
    }
  }, [isAuthenticated]);

  const initializeData = async () => {
    try {
      setIsLoading(true);
      
      // 获取或创建默认知识库
      const kbResponse = await ragService.getKnowledgeBases();
      let kb = kbResponse.data?.find(kb => kb.name === 'default');
      
      if (!kb) {
        try {
          const createResponse = await ragService.createKnowledgeBase({
            name: 'default',
            description: '默认知识库'
          });
          kb = createResponse.data;
        } catch (createError) {
          // 如果创建失败（可能是409冲突），重新获取知识库列表
          if (createError.response?.status === 409) {
            console.log('知识库已存在，重新获取列表');
            const retryResponse = await ragService.getKnowledgeBases();
            kb = retryResponse.data?.find(kb => kb.name === 'default');
            if (!kb) {
              throw new Error('无法获取或创建默认知识库');
            }
          } else {
            throw createError;
          }
        }
      }
      
      setKnowledgeBase(kb);
      
      // 加载文档
      if (kb?.id) {
        const docsResponse = await ragService.getDocuments(kb.id);
        setDocuments(docsResponse.data || []);
      }
      
      // 加载对话历史（暂时设为空数组）
      setConversations([]);
      
    } catch (error) {
      console.error('初始化数据失败:', error);
      toast.error('初始化失败，请刷新页面重试');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理问答
  const handleAskQuestion = async () => {
    if (!currentQuestion.trim() || !knowledgeBase?.id) return;
    
    try {
      setIsLoading(true);
      setCurrentAnswer('');
      setRelatedSources([]);
      
      const response = await ragService.askQuestion({
        question: currentQuestion,
        knowledgeBaseId: knowledgeBase.id
      });
      
      setCurrentAnswer(response.data.answer || '抱歉，我无法回答这个问题。');
      setRelatedSources(response.data.sources || []);
      
      // 添加到对话历史
      const newConversation = {
        id: Date.now(),
        question: currentQuestion,
        answer: response.data.answer,
        sources: response.data.sources,
        timestamp: new Date().toISOString()
      };
      setConversations(prev => [newConversation, ...prev]);
      
      setCurrentQuestion('');
      
    } catch (error) {
      console.error('提问失败:', error);
      toast.error('提问失败，请重试');
      setCurrentAnswer('抱歉，处理您的问题时出现了错误。');
    } finally {
      setIsLoading(false);
    }
  };

  // 处理文件上传
  const handleFileUpload = async (files) => {
    if (!files || files.length === 0 || !knowledgeBase?.id) return;
    
    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      // 模拟上传进度
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);
      
      // 正确调用uploadDocuments函数
      const metadata = {
        onProgress: (progress) => {
          setUploadProgress(progress);
        }
      };
      
      await ragService.uploadDocuments(knowledgeBase.id, Array.from(files), metadata);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      // 刷新文档列表
      const docsResponse = await ragService.getDocuments(knowledgeBase.id);
      setDocuments(docsResponse.data || []);
      
      toast.success(`成功上传 ${files.length} 个文件`);
      setShowUploadDialog(false);
      setSelectedFiles([]);
      
      // 清空文件输入元素以避免 ERR_UPLOAD_FILE_CHANGED 错误
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.value = '';
      }
      
    } catch (error) {
      console.error('上传失败:', error);
      toast.error('文件上传失败，请重试');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      
      // 清空文件输入元素以避免 ERR_UPLOAD_FILE_CHANGED 错误
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.value = '';
      }
    }
  };

  // 删除文档
  const handleDeleteDocument = async (documentId) => {
    try {
      await ragService.deleteDocument(documentId, knowledgeBase.id);
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      toast.success('文档删除成功');
    } catch (error) {
      console.error('删除文档失败:', error);
      toast.error('删除文档失败');
    }
    setAnchorEl(null);
  };

  // 获取文件图标
  const getFileIcon = (filename) => {
    const ext = filename?.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return <PictureAsPdf sx={{ color: '#d32f2f' }} />;
      case 'doc':
      case 'docx':
        return <Article sx={{ color: '#1976d2' }} />;
      case 'txt':
        return <InsertDriveFile sx={{ color: '#757575' }} />;
      case 'json':
        return <DataObject sx={{ color: '#ff9800' }} />;
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'py':
      case 'java':
      case 'cpp':
        return <Code sx={{ color: '#4caf50' }} />;
      default:
        return <Description sx={{ color: '#757575' }} />;
    }
  };

  // 侧边栏内容
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
          智能知识库
        </Typography>
        {isMobile && (
          <IconButton onClick={() => setSidebarOpen(false)}>
            <Close />
          </IconButton>
        )}
      </Box>

      {/* 标签页切换 */}
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1}>
          <Button
            variant={activeTab === 'chat' ? 'contained' : 'outlined'}
            size="small"
            startIcon={<QuestionAnswer />}
            onClick={() => setActiveTab('chat')}
            sx={{ flex: 1, textTransform: 'none' }}
          >
            问答
          </Button>
          <Button
            variant={activeTab === 'documents' ? 'contained' : 'outlined'}
            size="small"
            startIcon={<Folder />}
            onClick={() => setActiveTab('documents')}
            sx={{ flex: 1, textTransform: 'none' }}
          >
            文档
          </Button>
        </Stack>
      </Box>

      {/* 内容区域 */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', px: 2 }}>
        {activeTab === 'chat' && (
          <Box>
            {/* 对话历史 */}
            <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary', fontWeight: 600 }}>
              对话历史
            </Typography>
            {conversations.length === 0 ? (
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
              conversations.map((conv) => (
                <Card key={conv.id} sx={{ mb: 2, cursor: 'pointer' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="body2" sx={{ 
                      fontWeight: 500,
                      mb: 1,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {conv.question}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(conv.timestamp).toLocaleString()}
                    </Typography>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
        )}

        {activeTab === 'documents' && (
          <Box>
            {/* 上传按钮 */}
            <Button
              fullWidth
              variant="outlined"
              startIcon={<CloudUpload />}
              onClick={() => setShowUploadDialog(true)}
              sx={{ 
                mb: 3,
                borderRadius: 2,
                py: 1.5,
                textTransform: 'none',
                borderStyle: 'dashed'
              }}
            >
              上传文档
            </Button>

            {/* 文档列表 */}
            <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary', fontWeight: 600 }}>
              文档列表 ({documents.length})
            </Typography>
            {documents.length === 0 ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                height: '200px',
                color: 'text.secondary'
              }}>
                <Description sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                <Typography variant="body2">暂无文档</Typography>
              </Box>
            ) : (
              documents.map((doc) => (
                <Card key={doc.id} sx={{ mb: 1.5 }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {getFileIcon(doc.filename)}
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ 
                          fontWeight: 500,
                          noWrap: true,
                          mb: 0.5
                        }}>
                          {doc.filename || doc.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : '未知大小'}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          setAnchorEl(e.currentTarget);
                          setSelectedDocument(doc);
                        }}
                      >
                        <MoreVert sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
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

      {/* 主内容区域 */}
      <Box sx={{ 
        flexGrow: 1, 
        display: 'flex', 
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'background.default'
      }}>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ 
              width: 32, 
              height: 32, 
              borderRadius: 2, 
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Lightbulb sx={{ fontSize: 18, color: 'white' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '18px' }}>
                智能问答助手
              </Typography>
              <Typography variant="caption" color="text.secondary">
                基于您的知识库内容回答问题
              </Typography>
            </Box>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Chip 
            label={`${documents.length} 个文档`} 
            size="small" 
            variant="outlined"
            icon={<Description />}
          />
        </Paper>

        {/* 主要内容 */}
        <Box sx={{ 
          flexGrow: 1, 
          overflow: 'auto', 
          p: 3,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {currentAnswer ? (
            /* 问答结果显示 */
            <Box sx={{ mb: 4 }}>
              {/* 问题 */}
              <Paper 
                elevation={0}
                sx={{ 
                  p: 3,
                  mb: 3,
                  borderRadius: 3,
                  bgcolor: 'grey.50',
                  border: 1,
                  borderColor: 'divider'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: '50%', 
                    bgcolor: 'grey.300',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <QuestionAnswer sx={{ fontSize: 16 }} />
                  </Box>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="caption" sx={{ 
                      color: 'text.secondary',
                      fontWeight: 500,
                      mb: 1,
                      display: 'block'
                    }}>
                      您的问题
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {currentQuestion}
                    </Typography>
                  </Box>
                </Box>
              </Paper>

              {/* 答案 */}
              <Paper 
                elevation={0}
                sx={{ 
                  p: 3,
                  mb: 3,
                  borderRadius: 3,
                  bgcolor: 'background.paper',
                  border: 1,
                  borderColor: 'divider'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: '50%', 
                    bgcolor: 'primary.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <AutoAwesome sx={{ fontSize: 16, color: 'white' }} />
                  </Box>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="caption" sx={{ 
                      color: 'text.secondary',
                      fontWeight: 500,
                      mb: 1,
                      display: 'block'
                    }}>
                      AI 回答
                    </Typography>
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
                      {currentAnswer}
                    </ReactMarkdown>
                  </Box>
                </Box>
              </Paper>

              {/* 相关来源 */}
              {relatedSources.length > 0 && (
                <Paper 
                  elevation={0}
                  sx={{ 
                    p: 3,
                    borderRadius: 3,
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Source sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      相关文档来源
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {relatedSources.map((source, index) => (
                      <Chip
                        key={index}
                        label={source.filename || `文档 ${index + 1}`}
                        size="small"
                        variant="outlined"
                        icon={getFileIcon(source.filename)}
                        sx={{ borderRadius: 2 }}
                      />
                    ))}
                  </Stack>
                </Paper>
              )}
            </Box>
          ) : (
            /* 欢迎界面 */
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              color: 'text.secondary',
              textAlign: 'center'
            }}>
              <Lightbulb sx={{ fontSize: 80, color: 'primary.main', opacity: 0.5, mb: 3 }} />
              <Typography variant="h4" sx={{ fontWeight: 600, mb: 2 }}>
                开始智能问答
              </Typography>
              <Typography variant="body1" sx={{ maxWidth: 500, mb: 4 }}>
                基于您上传的文档内容，我可以为您提供准确的答案和相关信息
              </Typography>
              {documents.length === 0 && (
                <Alert severity="info" sx={{ maxWidth: 400 }}>
                  请先上传一些文档到知识库，然后就可以开始提问了
                </Alert>
              )}
            </Box>
          )}
        </Box>

        {/* 问题输入区域 */}
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
              placeholder="请输入您的问题..."
              value={currentQuestion}
              onChange={(e) => setCurrentQuestion(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAskQuestion();
                }
              }}
              disabled={!knowledgeBase || documents.length === 0}
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
              onClick={handleAskQuestion}
              disabled={!currentQuestion.trim() || isLoading || !knowledgeBase || documents.length === 0}
              sx={{
                bgcolor: currentQuestion.trim() && knowledgeBase && documents.length > 0 ? 'primary.main' : 'grey.300',
                color: 'white',
                width: 48,
                height: 48,
                '&:hover': {
                  bgcolor: currentQuestion.trim() && knowledgeBase && documents.length > 0 ? 'primary.dark' : 'grey.400'
                },
                '&.Mui-disabled': {
                  bgcolor: 'grey.300',
                  color: 'grey.500'
                }
              }}
            >
              {isLoading ? <CircularProgress size={20} color="inherit" /> : <Send />}
            </IconButton>
          </Box>
          {documents.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              请先上传文档到知识库
            </Typography>
          )}
        </Paper>
      </Box>

      {/* 上传文档弹窗 */}
      <Dialog 
        open={showUploadDialog} 
        onClose={() => setShowUploadDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 600 }}>
          上传文档
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box
            sx={{
              border: 2,
              borderColor: 'divider',
              borderStyle: 'dashed',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'action.hover'
              }
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              点击或拖拽文件到此处
            </Typography>
            <Typography variant="body2" color="text.secondary">
              支持 PDF, DOC, DOCX, TXT, JSON 等格式
            </Typography>
          </Box>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,.json,.js,.jsx,.ts,.tsx,.py,.java,.cpp"
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              setSelectedFiles(files);
            }}
          />
          
          {selectedFiles.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                选中的文件 ({selectedFiles.length})
              </Typography>
              {selectedFiles.map((file, index) => (
                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  {getFileIcon(file.name)}
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(file.size / 1024).toFixed(1)} KB
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          
          {isUploading && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                上传进度: {uploadProgress}%
              </Typography>
              <LinearProgress variant="determinate" value={uploadProgress} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button onClick={() => {
            setShowUploadDialog(false);
            setSelectedFiles([]);
            // 清空文件输入元素
            const fileInput = document.querySelector('input[type="file"]');
            if (fileInput) {
              fileInput.value = '';
            }
          }} disabled={isUploading}>
            取消
          </Button>
          <Button 
            onClick={() => handleFileUpload(selectedFiles)} 
            variant="contained"
            disabled={selectedFiles.length === 0 || isUploading}
          >
            {isUploading ? '上传中...' : '开始上传'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 文档操作菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => handleDeleteDocument(selectedDocument?.id)}>
          <Delete sx={{ mr: 1 }} /> 删除文档
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default SmartRAG;