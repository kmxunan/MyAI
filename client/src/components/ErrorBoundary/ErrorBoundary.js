import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  Collapse,
  IconButton
} from '@mui/material';
import {
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Home as HomeIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // 可以在这里发送错误报告到监控服务
    this.logErrorToService(error, errorInfo);
  }

  logErrorToService = (error, errorInfo) => {
    try {
      // 发送错误信息到后端或监控服务
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };
      
      // 这里可以调用API发送错误报告
      console.log('Error logged:', errorData);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    });
  };

  toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          showDetails={this.state.showDetails}
          onRetry={this.handleRetry}
          onToggleDetails={this.toggleDetails}
        />
      );
    }

    return this.props.children;
  }
}

const ErrorFallback = ({ error, errorInfo, showDetails, onRetry, onToggleDetails }) => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate('/');
  };

  const getErrorMessage = () => {
    if (error?.message) {
      return error.message;
    }
    return '应用程序遇到了一个意外错误';
  };

  const getErrorType = () => {
    if (error?.name) {
      return error.name;
    }
    return 'UnknownError';
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3
      }}
    >
      <Card sx={{ maxWidth: 600, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <ErrorIcon 
              sx={{ 
                fontSize: 64, 
                color: 'error.main', 
                mb: 2 
              }} 
            />
            <Typography variant="h4" gutterBottom color="error">
              出现错误
            </Typography>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {getErrorMessage()}
            </Typography>
          </Box>

          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>错误类型:</strong> {getErrorType()}
            </Typography>
            {error?.code && (
              <Typography variant="body2">
                <strong>错误代码:</strong> {error.code}
              </Typography>
            )}
          </Alert>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 3 }}>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={onRetry}
              color="primary"
            >
              重试
            </Button>
            <Button
              variant="outlined"
              startIcon={<HomeIcon />}
              onClick={handleGoHome}
            >
              返回首页
            </Button>
          </Box>

          {(error?.stack || errorInfo?.componentStack) && (
            <Box>
              <Button
                variant="text"
                size="small"
                onClick={onToggleDetails}
                startIcon={showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{ mb: 1 }}
              >
                {showDetails ? '隐藏' : '显示'}错误详情
              </Button>
              
              <Collapse in={showDetails}>
                <Alert severity="info" sx={{ mt: 1 }}>
                  <Typography variant="body2" component="div">
                    <strong>错误堆栈:</strong>
                    <Box
                      component="pre"
                      sx={{
                        mt: 1,
                        p: 1,
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                        fontSize: '0.75rem',
                        overflow: 'auto',
                        maxHeight: 200
                      }}
                    >
                      {error?.stack}
                    </Box>
                  </Typography>
                  
                  {errorInfo?.componentStack && (
                    <Typography variant="body2" component="div" sx={{ mt: 2 }}>
                      <strong>组件堆栈:</strong>
                      <Box
                        component="pre"
                        sx={{
                          mt: 1,
                          p: 1,
                          bgcolor: 'grey.100',
                          borderRadius: 1,
                          fontSize: '0.75rem',
                          overflow: 'auto',
                          maxHeight: 200
                        }}
                      >
                        {errorInfo.componentStack}
                      </Box>
                    </Typography>
                  )}
                </Alert>
              </Collapse>
            </Box>
          )}

          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{ 
              display: 'block', 
              textAlign: 'center', 
              mt: 3 
            }}
          >
            如果问题持续存在，请联系技术支持
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ErrorBoundary;