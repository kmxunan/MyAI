import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Badge,
  Tooltip,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Chat,
  Business,
  Description,
  CloudUpload,
  Settings,
  Logout,
  AccountCircle,
  Notifications,
  ChevronLeft,
  ChevronRight
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';

const drawerWidth = 240;

const menuItems = [
  {
    text: '仪表盘',
    icon: <Dashboard />,
    path: '/dashboard'
  },
  {
    text: '智能对话',
    icon: <Chat />,
    path: '/chat'
  },
  {
    text: '商业助手',
    icon: <Business />,
    path: '/business'
  },
  {
    text: 'RAG问答',
    icon: <Description />,
    path: '/rag'
  },
  {
    text: '文件处理',
    icon: <CloudUpload />,
    path: '/files'
  },
  {
    text: '设置',
    icon: <Settings />,
    path: '/settings'
  }
];

const Layout = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);

  // 需要保持全宽的路由（如聊天与RAG页面）
  const fullWidthRoutes = ['/chat', '/rag'];
  const isFullWidth = fullWidthRoutes.some((r) => location.pathname.startsWith(r));

  const handleDrawerToggle = () => {
    if (isMobile) {
      setMobileOpen(!mobileOpen);
    } else {
      setDrawerOpen(!drawerOpen);
    }
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    handleMenuClose();
    navigate('/login');
  };

  const handleNavigation = (path) => {
    navigate(path);
    if (isMobile) {
      setMobileOpen(false);
    }
  };

  const getCurrentPageTitle = () => {
    const currentItem = menuItems.find(item => location.pathname.startsWith(item.path));
    return currentItem ? currentItem.text : '智能助手';
  };

  const drawer = (
    <Box>
      <Toolbar>
        <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
          智能助手
        </Typography>
        {!isMobile && (
          <IconButton onClick={handleDrawerToggle}>
            {drawerOpen ? <ChevronLeft /> : <ChevronRight />}
          </IconButton>
        )}
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => {
          const selected = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding sx={{ display: 'block' }}>
              <Tooltip
                title={item.text}
                placement="right"
                arrow
                disableHoverListener={drawerOpen}
              >
                <ListItemButton
                  selected={selected}
                  onClick={() => handleNavigation(item.path)}
                  sx={{
                    minHeight: 48,
                    justifyContent: drawerOpen ? 'initial' : 'center',
                    px: 2.5,
                    borderRadius: 2,
                    mx: 1,
                    my: 0.5,
                    '&.Mui-selected': {
                      bgcolor: 'action.selected',
                      '&:hover': { bgcolor: 'action.selected' }
                    }
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      mr: drawerOpen ? 3 : 'auto',
                      justifyContent: 'center',
                      '& .MuiSvgIcon-root': {
                        color: selected ? theme.palette.primary.main : theme.palette.text.secondary
                      }
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    sx={{ opacity: drawerOpen ? 1 : 0 }}
                  />
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%' },
          ml: { md: drawerOpen ? `${drawerWidth}px` : 0 },
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: drawerOpen ? 'none' : 'block' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {getCurrentPageTitle()}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="通知">
              <IconButton color="inherit">
                <Badge badgeContent={0} color="error">
                  <Notifications />
                </Badge>
              </IconButton>
            </Tooltip>
            
            <Tooltip title="账户设置">
              <IconButton
                color="inherit"
                onClick={handleMenuOpen}
                sx={{ p: 0.5 }}
              >
                <Avatar
                  sx={{ width: 32, height: 32 }}
                  src={user?.avatar}
                  alt={user?.username}
                >
                  {user?.username?.charAt(0)?.toUpperCase()}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>
      
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        onClick={handleMenuClose}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: 'visible',
            filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
            mt: 1.5,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
            '&:before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={() => navigate('/settings')}>
          <AccountCircle sx={{ mr: 2 }} />
          个人资料
        </MenuItem>
        <MenuItem onClick={() => navigate('/settings')}>
          <Settings sx={{ mr: 2 }} />
          设置
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <Logout sx={{ mr: 2 }} />
          退出登录
        </MenuItem>
      </Menu>

      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>
        
        {/* Desktop drawer */}
        <Drawer
          variant="persistent"
          open={drawerOpen}
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerOpen ? drawerWidth : theme.spacing(7),
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              overflowX: 'hidden',
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: drawerOpen ? `calc(100% - ${drawerWidth}px)` : '100%' },
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          bgcolor: 'background.default',
          backgroundImage:
            theme.palette.mode === 'light'
              ? 'radial-gradient(1200px 500px at 20% -10%, rgba(25,118,210,0.06) 0%, transparent 60%), radial-gradient(1000px 400px at 100% 10%, rgba(255,193,7,0.08) 0%, transparent 50%)'
              : 'radial-gradient(1200px 500px at 20% -10%, rgba(144,202,249,0.06) 0%, transparent 60%), radial-gradient(1000px 400px at 100% 10%, rgba(255,213,79,0.06) 0%, transparent 50%)'
        }}
      >
        <Toolbar />
        {isFullWidth ? (
          <Outlet />
        ) : (
          <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%' }}>
            <Outlet />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Layout;