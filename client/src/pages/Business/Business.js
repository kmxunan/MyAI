import React, { useState } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,

  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Tabs,
  Tab,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  TrendingUp,
  Assessment,
  Business as BusinessIcon,
  Analytics,
  Download,
  Add,
  Lightbulb,
  Campaign,
  Inventory
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie
} from 'recharts';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import businessService from '../../services/businessService';

// 模拟业务数据
const businessTemplates = [
  {
    id: 'market-analysis',
    title: '市场分析报告',
    description: '深入分析目标市场，识别机会和威胁',
    icon: <Assessment />,
    category: 'analysis',
    fields: [
      { name: 'industry', label: '行业', type: 'text', required: true },
      { name: 'region', label: '地区', type: 'text', required: true },
      { name: 'timeframe', label: '时间范围', type: 'select', options: ['3个月', '6个月', '1年', '3年'] },
      { name: 'competitors', label: '主要竞争对手', type: 'textarea' }
    ]
  },
  {
    id: 'business-plan',
    title: '商业计划书',
    description: '制定完整的商业计划和策略',
    icon: <BusinessIcon />,
    category: 'planning',
    fields: [
      { name: 'businessName', label: '企业名称', type: 'text', required: true },
      { name: 'businessType', label: '业务类型', type: 'select', options: ['B2B', 'B2C', 'B2B2C', 'C2C'] },
      { name: 'targetMarket', label: '目标市场', type: 'textarea', required: true },
      { name: 'fundingNeeds', label: '资金需求', type: 'number' }
    ]
  },
  {
    id: 'financial-forecast',
    title: '财务预测',
    description: '预测收入、成本和盈利能力',
    icon: <TrendingUp />,
    category: 'finance',
    fields: [
      { name: 'revenue', label: '当前年收入', type: 'number', required: true },
      { name: 'growthRate', label: '预期增长率(%)', type: 'number', required: true },
      { name: 'costs', label: '主要成本', type: 'textarea' },
      { name: 'period', label: '预测期间', type: 'select', options: ['1年', '3年', '5年'] }
    ]
  },
  {
    id: 'marketing-strategy',
    title: '营销策略',
    description: '制定有效的营销和推广策略',
    icon: <Campaign />,
    category: 'marketing',
    fields: [
      { name: 'product', label: '产品/服务', type: 'text', required: true },
      { name: 'targetAudience', label: '目标受众', type: 'textarea', required: true },
      { name: 'budget', label: '营销预算', type: 'number' },
      { name: 'channels', label: '营销渠道', type: 'textarea' }
    ]
  },
  {
    id: 'swot-analysis',
    title: 'SWOT分析',
    description: '分析优势、劣势、机会和威胁',
    icon: <Analytics />,
    category: 'analysis',
    fields: [
      { name: 'company', label: '公司名称', type: 'text', required: true },
      { name: 'industry', label: '所属行业', type: 'text', required: true },
      { name: 'context', label: '分析背景', type: 'textarea' }
    ]
  },
  {
    id: 'product-launch',
    title: '产品发布计划',
    description: '制定新产品上市策略和时间表',
    icon: <Inventory />,
    category: 'product',
    fields: [
      { name: 'productName', label: '产品名称', type: 'text', required: true },
      { name: 'productType', label: '产品类型', type: 'text', required: true },
      { name: 'launchDate', label: '计划发布日期', type: 'date' },
      { name: 'targetMarket', label: '目标市场', type: 'textarea' }
    ]
  }
];

const recentReports = [
  {
    id: 1,
    title: '2024年电商市场分析',
    type: '市场分析报告',
    createdAt: '2024-01-15',
    status: 'completed'
  },
  {
    id: 2,
    title: 'AI初创公司商业计划',
    type: '商业计划书',
    createdAt: '2024-01-12',
    status: 'completed'
  },
  {
    id: 3,
    title: 'SaaS产品财务预测',
    type: '财务预测',
    createdAt: '2024-01-10',
    status: 'in_progress'
  }
];

const Business = () => {
  useAuthStore();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [formData, setFormData] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  const categories = [
    { value: 'all', label: '全部' },
    { value: 'analysis', label: '分析报告' },
    { value: 'planning', label: '规划策略' },
    { value: 'finance', label: '财务预测' },
    { value: 'marketing', label: '营销策略' },
    { value: 'product', label: '产品管理' }
  ];
  
  const filteredTemplates = selectedCategory === 'all' 
    ? businessTemplates 
    : businessTemplates.filter(template => template.category === selectedCategory);
  
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setFormData({});
    setShowTemplateDialog(true);
  };
  
  const handleFormChange = (fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };
  
  const handleGenerateReport = async () => {
    try {
      setIsGenerating(true);
      
      // 调用真实的API
      const reportData = {
        templateId: selectedTemplate.id,
        templateTitle: selectedTemplate.title,
        formData: formData
      };
      
      const response = await businessService.generateReport(reportData);
      
      setGeneratedReport(response.data);
      setShowTemplateDialog(false);
      toast.success('报告生成成功！');
      
    } catch (error) {
      console.error('生成报告失败:', error);
      toast.error(error.response?.data?.message || '生成报告失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };
  
  const TemplateCard = ({ template }) => (
    <Card 
      sx={{ 
        height: '100%', 
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4
        }
      }}
      onClick={() => handleTemplateSelect(template)}
    >
      <CardContent sx={{ textAlign: 'center', p: 3 }}>
        <Box sx={{ color: 'primary.main', mb: 2 }}>
          {React.cloneElement(template.icon, { sx: { fontSize: 48 } })}
        </Box>
        <Typography variant="h6" gutterBottom>
          {template.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {template.description}
        </Typography>
        <Chip 
          label={categories.find(c => c.value === template.category)?.label}
          size="small"
          variant="outlined"
        />
      </CardContent>
    </Card>
  );
  
  const ReportCard = ({ report }) => (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" gutterBottom>
              {report.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {report.type}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              创建时间: {new Date(report.createdAt).toLocaleDateString()}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip 
              label={report.status === 'completed' ? '已完成' : '进行中'}
              color={report.status === 'completed' ? 'success' : 'warning'}
              size="small"
            />
            <Tooltip title="下载报告">
              <IconButton size="small">
                <Download />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
  
  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* 页面头部 */}
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Typography variant="h4" gutterBottom>
          商业智能助手
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.9 }}>
          利用AI生成专业的商业分析报告和策略建议
        </Typography>
      </Paper>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="报告模板" />
          <Tab label="我的报告" />
          <Tab label="数据分析" />
        </Tabs>
      </Box>
      
      {/* 报告模板页面 */}
      {activeTab === 0 && (
        <Box>
          {/* 分类筛选 */}
          <Box sx={{ mb: 3 }}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>报告类别</InputLabel>
              <Select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map((category) => (
                  <MenuItem key={category.value} value={category.value}>
                    {category.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
          {/* 模板网格 */}
          <Grid container spacing={3}>
            {filteredTemplates.map((template) => (
              <Grid item xs={12} sm={6} md={4} key={template.id}>
                <TemplateCard template={template} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
      
      {/* 我的报告页面 */}
      {activeTab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">
              我的报告 ({recentReports.length})
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setActiveTab(0)}
            >
              创建新报告
            </Button>
          </Box>
          
          {recentReports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </Box>
      )}
      
      {/* 数据分析页面 */}
      {activeTab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  报告生成趋势
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={[
                    { month: '1月', reports: 12 },
                    { month: '2月', reports: 19 },
                    { month: '3月', reports: 15 },
                    { month: '4月', reports: 22 },
                    { month: '5月', reports: 28 },
                    { month: '6月', reports: 35 }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <RechartsTooltip />
                    <Line type="monotone" dataKey="reports" stroke="#8884d8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  报告类型分布
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={[
                        { name: '市场分析', value: 35, fill: '#8884d8' },
                        { name: '财务预测', value: 25, fill: '#82ca9d' },
                        { name: '商业计划', value: 20, fill: '#ffc658' },
                        { name: '营销策略', value: 15, fill: '#ff7300' },
                        { name: '其他', value: 5, fill: '#0088fe' }
                      ]}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label
                    />
                    <RechartsTooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
      
      {/* 模板配置对话框 */}
      <Dialog
        open={showTemplateDialog}
        onClose={() => setShowTemplateDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          配置 {selectedTemplate?.title}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {selectedTemplate?.description}
          </Typography>
          
          <Grid container spacing={2}>
            {selectedTemplate?.fields.map((field) => (
              <Grid item xs={12} sm={field.type === 'textarea' ? 12 : 6} key={field.name}>
                {field.type === 'select' ? (
                  <FormControl fullWidth>
                    <InputLabel>{field.label}</InputLabel>
                    <Select
                      value={formData[field.name] || ''}
                      onChange={(e) => handleFormChange(field.name, e.target.value)}
                    >
                      {field.options?.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : (
                  <TextField
                    fullWidth
                    label={field.label}
                    type={field.type}
                    multiline={field.type === 'textarea'}
                    rows={field.type === 'textarea' ? 3 : 1}
                    required={field.required}
                    value={formData[field.name] || ''}
                    onChange={(e) => handleFormChange(field.name, e.target.value)}
                  />
                )}
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowTemplateDialog(false)}>取消</Button>
          <Button
            onClick={handleGenerateReport}
            variant="contained"
            disabled={isGenerating}
            startIcon={isGenerating ? <CircularProgress size={20} /> : <Lightbulb />}
          >
            {isGenerating ? '生成中...' : '生成报告'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* 生成的报告对话框 */}
      <Dialog
        open={Boolean(generatedReport)}
        onClose={() => setGeneratedReport(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {generatedReport?.title}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
            {generatedReport?.content}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGeneratedReport(null)}>关闭</Button>
          <Button variant="contained" startIcon={<Download />}>
            下载报告
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Business;