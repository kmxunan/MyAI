import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  LinearProgress,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import {
  CloudUpload,
  Description,
  PictureAsPdf,
  TableChart,
  Delete,
  CheckCircle,
  Error
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

const FileUpload = ({ onUploadComplete, maxFiles = 10 }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [description, setDescription] = useState('');

  // 支持的文件类型
  const acceptedFileTypes = {
    'application/pdf': ['.pdf'],
    'text/plain': ['.txt'],
    'text/csv': ['.csv'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/msword': ['.doc']
  };

  // 获取文件图标
  const getFileIcon = (file) => {
    const extension = file.name.split('.').pop().toLowerCase();
    switch (extension) {
      case 'pdf':
        return <PictureAsPdf color="error" />;
      case 'csv':
        return <TableChart color="success" />;
      case 'txt':
      case 'doc':
      case 'docx':
        return <Description color="primary" />;
      default:
        return <Description />;
    }
  };

  // 文件拖拽处理
  const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
    setError('');
    
    if (rejectedFiles.length > 0) {
      const errors = rejectedFiles.map(file => 
        `${file.file.name}: ${file.errors.map(e => e.message).join(', ')}`
      );
      setError(`文件被拒绝: ${errors.join('; ')}`);
    }

    if (acceptedFiles.length > 0) {
      const newFiles = acceptedFiles.map(file => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        type: file.type
      }));
      
      setFiles(prev => {
        const combined = [...prev, ...newFiles];
        if (combined.length > maxFiles) {
          setError(`最多只能上传 ${maxFiles} 个文件`);
          return combined.slice(0, maxFiles);
        }
        return combined;
      });
    }
  }, [maxFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    maxFiles: maxFiles,
    maxSize: 50 * 1024 * 1024 // 50MB
  });

  // 删除文件
  const removeFile = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    setError('');
  };

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 上传文件
  const handleUpload = async () => {
    if (files.length === 0) {
      setError('请选择要上传的文件');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');
    setResults([]);

    try {
      const formData = new FormData();
      files.forEach(fileItem => {
        formData.append('files', fileItem.file);
      });
      
      if (description) {
        formData.append('description', description);
      }

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
        `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/files/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': authToken ? `Bearer ${authToken}` : ''
          },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(progress);
          }
        }
      );

      setResults(response.data.data);
      setShowResults(true);
      
      if (onUploadComplete) {
        onUploadComplete(response.data);
      }

      // 清空文件列表
      setFiles([]);
      setDescription('');
      
    } catch (error) {
      console.error('上传失败:', error);
      setError(
        error.response?.data?.message || 
        error.message || 
        '文件上传失败，请重试'
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // 清空所有文件
  const clearFiles = () => {
    setFiles([]);
    setError('');
    setResults([]);
  };

  return (
    <Box>
      {/* 文件拖拽区域 */}
      <Paper
        {...getRootProps()}
        sx={{
          p: 3,
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : 'grey.300',
          backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
          cursor: 'pointer',
          textAlign: 'center',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            borderColor: 'primary.main',
            backgroundColor: 'action.hover'
          }
        }}
      >
        <input {...getInputProps()} />
        <CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          {isDragActive ? '释放文件到这里' : '拖拽文件到这里或点击选择'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          支持 PDF, TXT, CSV, DOC, DOCX 格式，最大 50MB，最多 {maxFiles} 个文件
        </Typography>
      </Paper>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* 文件描述 */}
      {files.length > 0 && (
        <TextField
          fullWidth
          label="文件描述（可选）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          rows={2}
          sx={{ mt: 2 }}
          placeholder="为这些文件添加描述信息..."
        />
      )}

      {/* 文件列表 */}
      {files.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle1">
              已选择文件 ({files.length}/{maxFiles})
            </Typography>
            <Button size="small" onClick={clearFiles} color="error">
              清空全部
            </Button>
          </Box>
          
          <List dense>
            {files.map((fileItem) => (
              <ListItem
                key={fileItem.id}
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  mb: 1
                }}
              >
                <ListItemIcon>
                  {getFileIcon(fileItem)}
                </ListItemIcon>
                <ListItemText
                  primary={fileItem.name}
                  secondary={`${formatFileSize(fileItem.size)} • ${fileItem.type}`}
                />
                <IconButton
                  edge="end"
                  onClick={() => removeFile(fileItem.id)}
                  size="small"
                  color="error"
                >
                  <Delete />
                </IconButton>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* 上传按钮和进度 */}
      {files.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={uploading}
            startIcon={<CloudUpload />}
            fullWidth
            size="large"
          >
            {uploading ? '上传中...' : `上传 ${files.length} 个文件`}
          </Button>
          
          {uploading && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
                {uploadProgress}%
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* 结果对话框 */}
      <Dialog
        open={showResults}
        onClose={() => setShowResults(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          文件处理结果
        </DialogTitle>
        <DialogContent>
          {results.length > 0 && (
            <List>
              {results.map((result, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    {result.success ? (
                      <CheckCircle color="success" />
                    ) : (
                      <Error color="error" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={result.filename}
                    secondary={
                      result.success ? (
                        <Box>
                          <Typography variant="body2" color="success.main">
                            处理成功
                          </Typography>
                          {result.data && (
                            <Box sx={{ mt: 1 }}>
                              <Chip
                                size="small"
                                label={`类型: ${result.data.type}`}
                                sx={{ mr: 1 }}
                              />
                              <Chip
                                size="small"
                                label={`字数: ${result.data.wordCount}`}
                                sx={{ mr: 1 }}
                              />
                              {result.data.pages > 0 && (
                                <Chip
                                  size="small"
                                  label={`页数: ${result.data.pages}`}
                                />
                              )}
                            </Box>
                          )}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="error.main">
                          {result.error}
                        </Typography>
                      )
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowResults(false)}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FileUpload;