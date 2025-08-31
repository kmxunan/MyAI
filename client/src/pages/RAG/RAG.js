import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  LinearProgress,
  Tabs,
  Tab,
  Menu,
  MenuItem,
  Alert,
  CircularProgress,
  Divider,
  Avatar,
  InputAdornment
} from '@mui/material';
import {
  CloudUpload,
  Description,
  PictureAsPdf,
  TableChart,
  TextSnippet,
  Delete,
  Visibility,
  Search,
  Send,
  MoreVert,
  Download,
  SmartToy,
  Person,
  CheckCircle,
  Error,
  Info
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { ragService } from '../../services/ragService';



const RAG = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [documents, setDocuments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [question, setQuestion] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [knowledgeBase, setKnowledgeBase] = useState(null);
  
  const messagesEndRef = useRef(null);
  
  // 初始化数据加载
  useEffect(() => {
    const initializeData = async () => {
      try {
        // 获取或创建默认知识库
        const knowledgeBases = await ragService.getKnowledgeBases({ limit: 1 });
        let currentKnowledgeBase;
        
        if (knowledgeBases.data && knowledgeBases.data.length > 0) {
          currentKnowledgeBase = knowledgeBases.data[0];
        } else {
          // 创建默认知识库
          const newKnowledgeBase = await ragService.createKnowledgeBase({
            name: '默认知识库',
            description: '用于存储和查询文档的默认知识库'
          });
          currentKnowledgeBase = newKnowledgeBase.data;
        }
        
        setKnowledgeBase(currentKnowledgeBase);
        
        // 加载文档列表
        await loadDocuments(currentKnowledgeBase.id);
        
      } catch (error) {
        console.error('Failed to initialize RAG data:', error);
        toast.error('初始化数据失败，请刷新页面重试');
      }
    };
    
    initializeData();
  }, []);

  const loadDocuments = async (knowledgeBaseId) => {
    try {
      const response = await ragService.getDocuments(knowledgeBaseId);
      if (response.success) {
        setDocuments(response.data || []);
      } else {
        throw new Error(response.message || '获取文档列表失败');
      }
    } catch (error) {
      console.error('Load documents failed:', error);
      toast.error(`加载文档列表失败: ${error.message}`);
    }
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [conversations]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    
    if (!knowledgeBase) {
      toast.error('知识库未初始化，请刷新页面重试');
      return;
    }
    
    // 检查文件类型
    const allowedTypes = ['application/pdf', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('不支持的文件类型。请上传PDF、TXT、CSV或DOCX文件。');
      return;
    }
    
    // 检查文件大小（10MB限制）
    if (file.size > 10 * 1024 * 1024) {
      toast.error('文件大小不能超过10MB');
      return;
    }
    
    try {
      setIsProcessing(true);
      setUploadProgress(0);
      
      // 上传文件到服务器
      const metadata = {
        onProgress: (progress) => {
          setUploadProgress(progress);
        }
      };
      
      const response = await ragService.uploadDocuments(knowledgeBase.id, [file], metadata);
      
      if (response.success) {
        // 上传成功，重新加载文档列表
        await loadDocuments(knowledgeBase.id);
        setUploadProgress(100);
        toast.success('文档上传并处理成功！');
      } else {
        throw new Error(response.message || '上传失败');
      }
      
    } catch (error) {
      console.error('File upload failed:', error);
      toast.error(`文档处理失败: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    }
  });
  
  const handleAskQuestion = async () => {
    if (!question.trim()) return;
    
    if (!knowledgeBase) {
      toast.error('知识库未初始化，请刷新页面重试');
      return;
    }
    
    const userQuestion = question.trim();
    setQuestion('');
    setIsProcessing(true);
    
    try {
      // 调用RAG问答API
       const response = await ragService.chat(userQuestion, knowledgeBase.id, {
         topK: 5,
         includeMetadata: true
       });
      
      if (response.success) {
        const answerData = {
          id: Date.now(),
          question: userQuestion,
          answer: response.data.answer,
          sources: response.data.sources || [],
          timestamp: new Date().toLocaleString(),
          confidence: response.data.confidence || 0
        };
        
        setConversations(prev => [answerData, ...prev]);
        toast.success('问题回答完成！');
      } else {
        throw new Error(response.message || '问答失败');
      }
      
    } catch (error) {
      console.error('Question answering failed:', error);
      toast.error(`处理问题时出错: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleDeleteDocument = async (docId) => {
    if (!knowledgeBase) {
      toast.error('知识库未初始化');
      return;
    }
    
    try {
      const response = await ragService.deleteDocument(docId);
      
      if (response.success) {
        // 重新加载文档列表
        await loadDocuments(knowledgeBase.id);
        toast.success('文档删除成功');
      } else {
        throw new Error(response.message || '删除失败');
      }
    } catch (error) {
      console.error('Delete document failed:', error);
      toast.error(`删除文档失败: ${error.message}`);
    }
    setAnchorEl(null);
  };
  
  const handleViewDocument = (doc) => {
    setSelectedDocument(doc);
    setShowDocumentDialog(true);
    setAnchorEl(null);
  };
  
  const getFileIcon = (type) => {
    switch (type) {
      case 'pdf':
        return <PictureAsPdf sx={{ color: '#d32f2f' }} />;
      case 'csv':
        return <TableChart sx={{ color: '#388e3c' }} />;
      case 'txt':
        return <TextSnippet sx={{ color: '#1976d2' }} />;
      case 'docx':
        return <Description sx={{ color: '#1976d2' }} />;
      default:
        return <Description />;
    }
  };
  
  const getStatusChip = (status) => {
    switch (status) {
      case 'processed':
        return <Chip label="已处理" color="success" size="small" icon={<CheckCircle />} />;
      case 'processing':
        return <Chip label="处理中" color="warning" size="small" icon={<CircularProgress size={16} />} />;
      case 'error':
        return <Chip label="处理失败" color="error" size="small" icon={<Error />} />;
      default:
        return <Chip label="未知" size="small" />;
    }
  };
  
  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* 页面头部 */}
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Typography variant="h4" gutterBottom>
          RAG智能问答
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.9 }}>
          上传文档，基于您的知识库进行智能问答
        </Typography>
      </Paper>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="智能问答" />
          <Tab label="文档管理" />
          <Tab label="知识库" />
        </Tabs>
      </Box>
      
      {/* 智能问答页面 */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          {/* 问答区域 */}
          <Grid item xs={12} md={8}>
            <Card sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
                <List>
                  {conversations.map((conv) => (
                    <React.Fragment key={conv.id}>
                      {/* 用户问题 */}
                      <ListItem sx={{ justifyContent: 'flex-end', py: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', maxWidth: '80%' }}>
                          <Paper
                            sx={{
                              p: 2,
                              bgcolor: 'primary.light',
                              color: 'primary.contrastText',
                              borderRadius: 2,
                              mr: 1
                            }}
                          >
                            <Typography variant="body1">
                              {conv.question}
                            </Typography>
                          </Paper>
                          <Avatar sx={{ bgcolor: 'primary.main' }}>
                            <Person />
                          </Avatar>
                        </Box>
                      </ListItem>
                      
                      {/* AI回答 */}
                      <ListItem sx={{ justifyContent: 'flex-start', py: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', maxWidth: '80%' }}>
                          <Avatar sx={{ bgcolor: 'secondary.main', mr: 1 }}>
                            <SmartToy />
                          </Avatar>
                          <Paper
                            sx={{
                              p: 2,
                              bgcolor: 'grey.100',
                              borderRadius: 2
                            }}
                          >
                            <ReactMarkdown>{conv.answer}</ReactMarkdown>
                            
                            <Divider sx={{ my: 2 }} />
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box>
                                <Typography variant="caption" color="text.secondary">
                                  来源: {conv.sources.join(', ')}
                                </Typography>
                                <br />
                                <Typography variant="caption" color="text.secondary">
                                  置信度: {(conv.confidence * 100).toFixed(0)}%
                                </Typography>
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {conv.timestamp}
                              </Typography>
                            </Box>
                          </Paper>
                        </Box>
                      </ListItem>
                    </React.Fragment>
                  ))}
                  <div ref={messagesEndRef} />
                </List>
              </CardContent>
              
              {/* 问题输入区域 */}
              <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    multiline
                    maxRows={3}
                    placeholder="请输入您的问题..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAskQuestion();
                      }
                    }}
                    disabled={isProcessing}
                  />
                  <Button
                    variant="contained"
                    onClick={handleAskQuestion}
                    disabled={!question.trim() || isProcessing}
                    sx={{ minWidth: 'auto', px: 2 }}
                  >
                    {isProcessing ? <CircularProgress size={20} /> : <Send />}
                  </Button>
                </Box>
              </Box>
            </Card>
          </Grid>
          
          {/* 侧边栏信息 */}
          <Grid item xs={12} md={4}>
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  知识库状态
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    已处理文档: {documents.filter(doc => doc.status === 'processed').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    总文档块: {documents.reduce((sum, doc) => sum + doc.chunks, 0)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    问答历史: {conversations.length}
                  </Typography>
                </Box>
                
                {uploadProgress > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" gutterBottom>
                      处理进度: {uploadProgress}%
                    </Typography>
                    <LinearProgress variant="determinate" value={uploadProgress} />
                  </Box>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  使用提示
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon>
                      <Info color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary="上传相关文档"
                      secondary="支持PDF、TXT、CSV、DOCX格式"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Info color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary="提出具体问题"
                      secondary="问题越具体，回答越准确"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Info color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary="查看来源信息"
                      secondary="每个回答都会显示信息来源"
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      
      {/* 文档管理页面 */}
      {activeTab === 1 && (
        <Box>
          {/* 文档上传区域 */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box
                {...getRootProps()}
                sx={{
                  border: 2,
                  borderColor: isDragActive ? 'primary.main' : 'grey.300',
                  borderStyle: 'dashed',
                  borderRadius: 2,
                  p: 4,
                  textAlign: 'center',
                  cursor: 'pointer',
                  bgcolor: isDragActive ? 'action.hover' : 'transparent',
                  transition: 'all 0.2s'
                }}
              >
                <input {...getInputProps()} />
                <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                  {isDragActive ? '释放文件以上传' : '拖拽文件到此处或点击上传'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  支持 PDF、TXT、CSV、DOCX 格式，最大 10MB
                </Typography>
              </Box>
              
              {uploadProgress > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    上传进度: {uploadProgress}%
                  </Typography>
                  <LinearProgress variant="determinate" value={uploadProgress} />
                </Box>
              )}
            </CardContent>
          </Card>
          
          {/* 文档搜索 */}
          <Box sx={{ mb: 2 }}>
            <TextField
              fullWidth
              placeholder="搜索文档..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                )
              }}
            />
          </Box>
          
          {/* 文档列表 */}
          <Grid container spacing={2}>
            {filteredDocuments.map((doc) => (
              <Grid item xs={12} sm={6} md={4} key={doc.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      {getFileIcon(doc.type)}
                      <Box sx={{ ml: 2, flexGrow: 1 }}>
                        <Typography variant="subtitle1" noWrap>
                          {doc.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {doc.size} • {doc.uploadedAt}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          setAnchorEl(e.currentTarget);
                          setSelectedDocId(doc.id);
                        }}
                      >
                        <MoreVert />
                      </IconButton>
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {doc.description}
                    </Typography>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {getStatusChip(doc.status)}
                      {doc.status === 'processed' && (
                        <Typography variant="caption" color="text.secondary">
                          {doc.chunks} 个文档块
                        </Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
      
      {/* 知识库页面 */}
      {activeTab === 2 && (
        <Box>
          <Alert severity="info" sx={{ mb: 3 }}>
            知识库功能正在开发中，敬请期待！
          </Alert>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    知识库统计
                  </Typography>
                  <List>
                    <ListItem>
                      <ListItemText
                        primary="总文档数"
                        secondary={documents.length}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="已处理文档"
                        secondary={documents.filter(doc => doc.status === 'processed').length}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="文档块总数"
                        secondary={documents.reduce((sum, doc) => sum + doc.chunks, 0)}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="问答次数"
                        secondary={conversations.length}
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    文档类型分布
                  </Typography>
                  <List>
                    {['pdf', 'docx', 'txt', 'csv'].map((type) => {
                      const count = documents.filter(doc => doc.type === type).length;
                      return (
                        <ListItem key={type}>
                          <ListItemIcon>
                            {getFileIcon(type)}
                          </ListItemIcon>
                          <ListItemText
                            primary={type.toUpperCase()}
                            secondary={`${count} 个文档`}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}
      
      {/* 文档操作菜单 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => {
          const doc = documents.find(d => d.id === selectedDocId);
          if (doc) handleViewDocument(doc);
        }}>
          <Visibility sx={{ mr: 1 }} /> 查看详情
        </MenuItem>
        <MenuItem onClick={() => {
          // 下载文档逻辑
          setAnchorEl(null);
        }}>
          <Download sx={{ mr: 1 }} /> 下载
        </MenuItem>
        <MenuItem onClick={() => handleDeleteDocument(selectedDocId)}>
          <Delete sx={{ mr: 1 }} /> 删除
        </MenuItem>
      </Menu>
      
      {/* 文档详情对话框 */}
      <Dialog
        open={showDocumentDialog}
        onClose={() => setShowDocumentDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          文档详情
        </DialogTitle>
        <DialogContent>
          {selectedDocument && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {selectedDocument.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                {selectedDocument.description}
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>文件大小:</strong> {selectedDocument.size}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>上传时间:</strong> {selectedDocument.uploadedAt}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>处理状态:</strong> {selectedDocument.status}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">
                    <strong>文档块数:</strong> {selectedDocument.chunks}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDocumentDialog(false)}>关闭</Button>
          <Button variant="contained" startIcon={<Download />}>
            下载
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RAG;