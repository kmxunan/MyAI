import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Tabs,
  Tab,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip
} from '@mui/material';
import {
  CloudUpload,
  TextFields,
  Description,
  Info
} from '@mui/icons-material';
import FileUpload from '../../components/FileUpload/FileUpload';
import axios from 'axios';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`file-tabpanel-${index}`}
      aria-labelledby={`file-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const FileUploadPage = () => {
  const [tabValue, setTabValue] = useState(0);
  const [textContent, setTextContent] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [showSupportedTypes, setShowSupportedTypes] = useState(false);
  const [supportedTypes, setSupportedTypes] = useState([]);

  // 处理文件上传完成
  const handleFileUploadComplete = (uploadResults) => {
    console.log('文件上传完成:', uploadResults);
    setResults(uploadResults);
  };

  // 处理文本内容
  const handleTextProcess = async () => {
    if (!textContent.trim()) {
      setError('请输入文本内容');
      return;
    }

    setProcessing(true);
    setError('');
    setResults(null);

    try {
      const token = localStorage.getItem('auth-storage');
      let authToken = '';
      if (token) {
        try {
          const authData = JSON.parse(token);
          authToken = authData.state?.token || '';
        } catch (e) {
          console.error('解析token失败:', e);
        }
      }

      const response = await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/files/process-text`,
        {
          content: textContent,
          title: textTitle || '未命名文本'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken ? `Bearer ${authToken}` : ''
          }
        }
      );

      setResults({
        success: true,
        message: '文本处理成功',
        data: [{
          filename: textTitle || '文本内容',
          success: true,
          data: response.data.data
        }]
      });

      // 清空输入
      setTextContent('');
      setTextTitle('');
      
    } catch (error) {
      console.error('文本处理失败:', error);
      setError(
        error.response?.data?.message || 
        error.message || 
        '文本处理失败，请重试'
      );
    } finally {
      setProcessing(false);
    }
  };

  // 获取支持的文件类型
  const fetchSupportedTypes = async () => {
    try {
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/files/supported-types`
      );
      setSupportedTypes(response.data.data.supportedTypes);
      setShowSupportedTypes(true);
    } catch (error) {
      console.error('获取支持类型失败:', error);
      setError('获取支持的文件类型失败');
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    setError('');
    setResults(null);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        文件处理中心
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        上传并处理各种格式的文档，或直接输入文本内容进行处理
      </Typography>

      {/* 操作按钮 */}
      <Box sx={{ mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<Info />}
          onClick={fetchSupportedTypes}
          sx={{ mr: 2 }}
        >
          查看支持的文件类型
        </Button>
      </Box>

      <Paper sx={{ width: '100%' }}>
        {/* 标签页 */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="文件处理选项">
            <Tab
              icon={<CloudUpload />}
              label="文件上传"
              id="file-tab-0"
              aria-controls="file-tabpanel-0"
            />
            <Tab
              icon={<TextFields />}
              label="文本处理"
              id="file-tab-1"
              aria-controls="file-tabpanel-1"
            />
          </Tabs>
        </Box>

        {/* 文件上传面板 */}
        <TabPanel value={tabValue} index={0}>
          <FileUpload
            onUploadComplete={handleFileUploadComplete}
            maxFiles={10}
          />
        </TabPanel>

        {/* 文本处理面板 */}
        <TabPanel value={tabValue} index={1}>
          <Box>
            <TextField
              fullWidth
              label="文本标题（可选）"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              sx={{ mb: 2 }}
              placeholder="为文本内容添加标题..."
            />
            
            <TextField
              fullWidth
              label="文本内容"
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              multiline
              rows={10}
              sx={{ mb: 2 }}
              placeholder="在这里输入或粘贴文本内容..."
              required
            />
            
            <Button
              variant="contained"
              onClick={handleTextProcess}
              disabled={processing || !textContent.trim()}
              startIcon={<Description />}
              size="large"
            >
              {processing ? '处理中...' : '处理文本'}
            </Button>
          </Box>
        </TabPanel>
      </Paper>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* 处理结果 */}
      {results && (
        <Paper sx={{ mt: 3, p: 3 }}>
          <Typography variant="h6" gutterBottom>
            处理结果
          </Typography>
          
          <Alert 
            severity={results.success ? 'success' : 'error'} 
            sx={{ mb: 2 }}
          >
            {results.message}
          </Alert>

          {results.data && results.data.length > 0 && (
            <List>
              {results.data.map((item, index) => (
                <ListItem key={index} divider>
                  <ListItemIcon>
                    <Description color={item.success ? 'primary' : 'error'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.filename}
                    secondary={
                      item.success && item.data ? (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="body2" color="text.secondary">
                            处理成功
                          </Typography>
                          <Box sx={{ mt: 1 }}>
                            <Chip
                              size="small"
                              label={`类型: ${item.data.type}`}
                              sx={{ mr: 1 }}
                            />
                            <Chip
                              size="small"
                              label={`字数: ${item.data.wordCount}`}
                              sx={{ mr: 1 }}
                            />
                            {item.data.pages && item.data.pages > 0 && (
                              <Chip
                                size="small"
                                label={`页数: ${item.data.pages}`}
                              />
                            )}
                          </Box>
                          {item.data.content && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                              <Typography variant="body2" color="text.secondary" gutterBottom>
                                内容预览:
                              </Typography>
                              <Typography variant="body2" sx={{ 
                                maxHeight: 200, 
                                overflow: 'auto',
                                whiteSpace: 'pre-wrap'
                              }}>
                                {item.data.content.substring(0, 500)}
                                {item.data.content.length > 500 && '...'}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="error.main">
                          {item.error || '处理失败'}
                        </Typography>
                      )
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      )}

      {/* 支持的文件类型对话框 */}
      <Dialog
        open={showSupportedTypes}
        onClose={() => setShowSupportedTypes(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          支持的文件类型
        </DialogTitle>
        <DialogContent>
          {supportedTypes.length > 0 ? (
            <List>
              {supportedTypes.map((type, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Description />
                  </ListItemIcon>
                  <ListItemText
                    primary={type.description}
                    secondary={`${type.extension} (${type.mimeType})`}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography>加载中...</Typography>
          )}
          
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              • 最大文件大小: 50MB<br/>
              • 最多同时上传: 10个文件<br/>
              • 支持批量处理
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSupportedTypes(false)}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FileUploadPage;