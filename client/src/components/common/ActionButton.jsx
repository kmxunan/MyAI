import React from 'react';
import { Button, CircularProgress } from '@mui/material';

/**
 * ActionButton
 * 统一按钮：包含加载态、防重复点击、尺寸/变体/颜色一致化
 */
const ActionButton = ({ loading, disabled, children, startIcon, endIcon, variant = 'contained', color = 'primary', size = 'medium', onClick, sx, ...rest }) => {
  const isDisabled = disabled || loading;
  return (
    <Button
      variant={variant}
      color={color}
      size={size}
      disabled={isDisabled}
      onClick={onClick}
      startIcon={!loading ? startIcon : undefined}
      endIcon={!loading ? endIcon : undefined}
      sx={{
        borderRadius: 1.5,
        textTransform: 'none',
        fontWeight: 600,
        px: 2.25,
        ...(variant === 'contained' && { boxShadow: 'none' }),
        ...sx,
      }}
      {...rest}
    >
      {loading ? <CircularProgress size={20} color="inherit" /> : children}
    </Button>
  );
};

export default ActionButton;