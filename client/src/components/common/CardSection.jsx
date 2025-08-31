import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';

/**
 * CardSection
 * 统一区块：标题、描述、内容卡片容器
 */
const CardSection = ({ title, description, actions, headerActions, children, sx }) => {
  return (
    <Box sx={{ mb: 3 }}>
      {(title || description || headerActions) && (
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Typography variant="h6" sx={{ fontWeight: 600, mb: description ? 0.5 : 0 }}>
                {title}
              </Typography>
            )}
            {description && (
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            )}
          </Box>
          {headerActions && (
            <Box sx={{ flexShrink: 0, display: 'flex', gap: 1 }}>
              {headerActions}
            </Box>
          )}
        </Box>
      )}
      <Card
        elevation={0}
        sx={{
          border: (theme) => `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          boxShadow: (theme) => (theme.palette.mode === 'light' ? '0 1px 2px rgba(0,0,0,0.06)' : '0 1px 2px rgba(0,0,0,0.3)'),
          overflow: 'hidden',
          ...sx,
        }}
      >
        <CardContent sx={{ p: 2.5 }}>
          {children}
          {actions && (
            <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              {actions}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default CardSection;