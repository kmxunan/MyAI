import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

const Test = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        测试页面
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="h6">
            这是一个简单的测试页面
          </Typography>
          <Typography variant="body1">
            如果您能看到这个内容，说明React组件渲染正常。
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Test;