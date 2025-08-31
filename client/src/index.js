import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './styles/index.css';
import reportWebVitals from './reportWebVitals';

// 创建主题 - 现代简洁风格
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#4285f4',
      light: '#669df6',
      dark: '#1a73e8',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#9c27b0',
      light: '#ba68c8',
      dark: '#7b1fa2',
      contrastText: '#ffffff',
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
    divider: 'rgba(0, 0, 0, 0.06)',
    text: {
      primary: '#202124',
      secondary: 'rgba(32, 33, 36, 0.6)'
    },
    success: {
      main: '#34a853',
      light: '#81c995',
      dark: '#137333',
    },
    warning: {
      main: '#fbbc04',
      light: '#fdd663',
      dark: '#f9ab00',
    },
    error: {
      main: '#ea4335',
      light: '#f28b82',
      dark: '#d33b2c',
    }
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Google Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { 
      fontSize: '2.125rem', 
      fontWeight: 400, 
      letterSpacing: '-0.01em',
      lineHeight: 1.2
    },
    h2: { 
      fontSize: '1.75rem', 
      fontWeight: 400, 
      letterSpacing: '-0.01em',
      lineHeight: 1.3
    },
    h3: { 
      fontSize: '1.5rem', 
      fontWeight: 400,
      lineHeight: 1.4
    },
    h4: { 
      fontSize: '1.25rem', 
      fontWeight: 500,
      lineHeight: 1.4
    },
    h5: {
      fontSize: '1.125rem',
      fontWeight: 500,
      lineHeight: 1.5
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5
    },
    body1: { 
      fontSize: '0.875rem',
      lineHeight: 1.5,
      letterSpacing: '0.01em'
    },
    body2: { 
      fontSize: '0.75rem',
      lineHeight: 1.4,
      letterSpacing: '0.01em'
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      textTransform: 'none',
      letterSpacing: '0.01em'
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.4,
      letterSpacing: '0.03em'
    }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: '#fafafa',
          fontFamily: '"Google Sans", "Roboto", "Helvetica", "Arial", sans-serif',
        },
        '::-webkit-scrollbar': {
          width: 6,
          height: 6,
        },
        '::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '::-webkit-scrollbar-thumb': {
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: 3,
        },
        '::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(0, 0, 0, 0.3)',
        },
        '*': {
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(0, 0, 0, 0.2) transparent',
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: '#ffffff',
          color: '#202124',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.06)'
        }
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: '1px solid rgba(0, 0, 0, 0.06)',
          backgroundColor: '#ffffff'
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundImage: 'none',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
          border: 'none'
        },
        elevation1: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)'
        },
        elevation2: {
          boxShadow: '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)'
        },
        elevation3: {
          boxShadow: '0 10px 20px rgba(0, 0, 0, 0.19), 0 6px 6px rgba(0, 0, 0, 0.23)'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
          border: 'none',
          transition: 'box-shadow 0.3s ease-in-out',
          '&:hover': {
            boxShadow: '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)'
          }
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 20,
          fontWeight: 500,
          fontSize: '0.875rem',
          padding: '8px 16px',
          minHeight: 36,
          transition: 'all 0.2s ease-in-out'
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)'
          }
        },
        outlined: {
          borderWidth: 1,
          '&:hover': {
            borderWidth: 1
          }
        },
        text: {
          '&:hover': {
            backgroundColor: 'rgba(66, 133, 244, 0.04)'
          }
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(0, 0, 0, 0.23)'
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(0, 0, 0, 0.87)'
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#4285f4',
            borderWidth: 2
          }
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 8px',
          '&.Mui-selected': {
            backgroundColor: 'rgba(66, 133, 244, 0.08)',
            '&:hover': {
              backgroundColor: 'rgba(66, 133, 244, 0.12)'
            }
          },
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)'
          }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          fontSize: '0.75rem',
          height: 28,
          '& .MuiChip-label': {
            padding: '0 8px'
          }
        },
        outlined: {
          borderColor: 'rgba(0, 0, 0, 0.23)'
        }
      }
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          border: 'none',
          boxShadow: '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)',
          marginTop: 4
        }
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          minHeight: 40,
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)'
          }
        }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 4,
          fontSize: '0.75rem',
          backgroundColor: 'rgba(97, 97, 97, 0.9)',
          padding: '6px 8px'
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          minHeight: 48,
          '&.Mui-selected': {
            color: '#4285f4'
          }
        }
      }
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: '#4285f4',
          height: 2
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)'
          }
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputLabel-root': {
            fontSize: '0.875rem'
          },
          '& .MuiInputLabel-root.Mui-focused': {
            color: '#4285f4'
          }
        }
      }
    }
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
          }}
        />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// 性能监控
reportWebVitals();